import { Injectable } from '@nestjs/common';
import type {
  Paginado,
  SocioActualizar,
  SocioBaja,
  SocioCrear,
  SocioDetalle,
  SocioListar,
  SocioListItem,
} from '@mf/shared';
import { Prisma, type Socio } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha, deFechaNullable, fechaLegible } from '../common/fechas';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conParcelasVigentes = {
  asignaciones: {
    where: { hasta: null },
    orderBy: { parcela: { codigo: 'asc' } },
    select: { parcela: { select: { id: true, codigo: true } } },
  },
} satisfies Prisma.SocioInclude;

type SocioConParcelas = Socio & { asignaciones: { parcela: { id: number; codigo: string } }[] };

@Injectable()
export class SociosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ q, estado, page, pageSize }: SocioListar): Promise<Paginado<SocioListItem>> {
    const where: Prisma.SocioWhereInput = {
      ...(estado === 'activo' && { fechaBaja: null }),
      ...(estado === 'baja' && { fechaBaja: { not: null } }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
    };

    const [total, socios] = await this.prisma.$transaction([
      this.prisma.socio.count({ where }),
      this.prisma.socio.findMany({
        where,
        include: conParcelasVigentes,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { numero: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: socios.map((s) => this.aListItem(s)), total, page, pageSize };
  }

  async obtener(id: number): Promise<SocioDetalle> {
    const socio = await this.prisma.socio.findUnique({
      where: { id },
      include: {
        asignaciones: {
          orderBy: [{ hasta: { sort: 'desc', nulls: 'first' } }, { desde: 'desc' }],
          include: { parcela: { select: { id: true, codigo: true, sector: true } } },
        },
      },
    });
    if (!socio) throw noEncontrado('No existe el socio');

    const vigentes = socio.asignaciones.filter((a) => a.hasta === null);
    return {
      ...this.aListItem({ ...socio, asignaciones: vigentes }),
      direccion: socio.direccion,
      observaciones: socio.observaciones,
      motivoBaja: socio.motivoBaja,
      asignaciones: socio.asignaciones.map((a) => ({
        id: a.id,
        desde: deFecha(a.desde),
        hasta: deFechaNullable(a.hasta),
        parcela: a.parcela,
      })),
    };
  }

  async crear(data: SocioCrear): Promise<SocioDetalle> {
    try {
      const socio = await this.prisma.$transaction(async (tx) => {
        const numero = data.numero ?? (await this.siguienteNumero(tx));
        return tx.socio.create({ data: { ...data, numero, fechaAlta: aFecha(data.fechaAlta) } });
      });
      return this.obtener(socio.id);
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  async actualizar(id: number, data: SocioActualizar): Promise<SocioDetalle> {
    const actual = await this.prisma.socio.findUnique({
      where: { id },
      include: { asignaciones: { orderBy: { desde: 'asc' }, take: 1 } },
    });
    if (!actual) throw noEncontrado('No existe el socio');

    const { numero, fechaAlta, ...resto } = data;
    if (fechaAlta) {
      const primera = actual.asignaciones[0];
      if (primera && aFecha(fechaAlta) > primera.desde) {
        throw reglaIncumplida(
          `La fecha de alta no puede ser posterior a su primera parcela (${fechaLegible(primera.desde)})`,
          'fechaAlta',
        );
      }
    }

    try {
      await this.prisma.socio.update({
        where: { id },
        data: {
          ...resto,
          ...(numero != null && { numero }),
          ...(fechaAlta && { fechaAlta: aFecha(fechaAlta) }),
        },
      });
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
    return this.obtener(id);
  }

  /** Da de baja al socio y libera sus parcelas vigentes con la misma fecha. */
  async darDeBaja(id: number, { fechaBaja, motivo }: SocioBaja): Promise<SocioDetalle> {
    const socio = await this.prisma.socio.findUnique({
      where: { id },
      include: { asignaciones: { where: { hasta: null }, include: { parcela: true } } },
    });
    if (!socio) throw noEncontrado('No existe el socio');
    if (socio.fechaBaja) throw conflicto('El socio ya está dado de baja');

    const baja = aFecha(fechaBaja);
    if (baja < socio.fechaAlta) {
      throw reglaIncumplida(
        `La fecha de baja no puede ser anterior al alta (${fechaLegible(socio.fechaAlta)})`,
        'fechaBaja',
      );
    }
    const posterior = socio.asignaciones.find((a) => a.desde > baja);
    if (posterior) {
      throw reglaIncumplida(
        `La parcela ${posterior.parcela.codigo} se asignó el ${fechaLegible(posterior.desde)}, después de la fecha de baja`,
        'fechaBaja',
      );
    }

    await this.prisma.$transaction([
      this.prisma.asignacion.updateMany({ where: { socioId: id, hasta: null }, data: { hasta: baja } }),
      this.prisma.socio.update({ where: { id }, data: { fechaBaja: baja, motivoBaja: motivo } }),
    ]);
    return this.obtener(id);
  }

  /** Reactiva al socio. Las parcelas liberadas en la baja no se reasignan solas. */
  async reactivar(id: number): Promise<SocioDetalle> {
    const socio = await this.prisma.socio.findUnique({ where: { id } });
    if (!socio) throw noEncontrado('No existe el socio');
    if (!socio.fechaBaja) throw conflicto('El socio ya está activo');
    await this.prisma.socio.update({ where: { id }, data: { fechaBaja: null, motivoBaja: null } });
    return this.obtener(id);
  }

  private condicionesBusqueda(q: string): Prisma.SocioWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.SocioWhereInput[] = [
      {
        AND: palabras.map((p) => ({
          OR: [
            { nombre: { contains: p, mode: 'insensitive' } },
            { apellido: { contains: p, mode: 'insensitive' } },
          ],
        })),
      },
      { asignaciones: { some: { hasta: null, parcela: { codigo: { contains: q, mode: 'insensitive' } } } } },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      condiciones.push({ dni: { contains: digitos } });
      const numero = Number(digitos);
      if (Number.isSafeInteger(numero) && numero <= 2_147_483_647) condiciones.push({ numero });
    }
    return condiciones;
  }

  private async siguienteNumero(tx: Prisma.TransactionClient): Promise<number> {
    const { _max } = await tx.socio.aggregate({ _max: { numero: true } });
    return (_max.numero ?? 0) + 1;
  }

  private traducirDuplicado(e: unknown): unknown {
    if (!esDuplicado(e)) return e;
    const campos = String(e.meta?.target ?? '');
    if (campos.includes('dni')) return conflicto('Ya existe un socio con ese DNI', 'dni');
    if (campos.includes('numero')) return conflicto('Ya existe un socio con ese número', 'numero');
    return conflicto('Ya existe un socio con esos datos');
  }

  private aListItem(s: SocioConParcelas): SocioListItem {
    return {
      id: s.id,
      numero: s.numero,
      nombre: s.nombre,
      apellido: s.apellido,
      dni: s.dni,
      email: s.email,
      telefono: s.telefono,
      fechaAlta: deFecha(s.fechaAlta),
      fechaBaja: deFechaNullable(s.fechaBaja),
      estado: s.fechaBaja ? 'baja' : 'activo',
      parcelas: s.asignaciones.map((a) => ({ id: a.parcela.id, codigo: a.parcela.codigo })),
    };
  }
}
