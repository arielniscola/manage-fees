import { Injectable } from '@nestjs/common';
import { hoy, interesDeCuota } from '@mf/shared';
import type {
  EstadoCuenta,
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
import { sociosDelLoteo } from '../common/loteo';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conParcelasVigentes = {
  asignaciones: {
    where: { hasta: null },
    orderBy: { parcela: { codigo: 'asc' } },
    select: { parcela: parcelaResumen },
  },
} satisfies Prisma.SocioInclude;

type SocioConParcelas = Socio & { asignaciones: Prisma.AsignacionGetPayload<{ select: { parcela: typeof parcelaResumen } }>[] };

const SIN_DEUDA: EstadoCuenta = { pendientes: 0, vencidas: 0, deuda: 0, deudaVencida: 0, interes: 0 };

@Injectable()
export class SociosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interes: InteresService,
  ) {}

  async listar(filtros: SocioListar): Promise<Paginado<SocioListItem>> {
    if (filtros.estado === 'moroso') return this.listarMorosos(filtros);

    const { q, estado, loteoId, page, pageSize } = filtros;
    const where: Prisma.SocioWhereInput = {
      ...(estado === 'activo' && { fechaBaja: null }),
      ...(estado === 'baja' && { fechaBaja: { not: null } }),
      ...(estado === 'suplente' && { fechaBaja: null, tipo: 'SUPLENTE' as const }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
      ...sociosDelLoteo(loteoId),
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

    const cuentas = await this.estadoDeCuenta(socios.map((s) => s.id));
    return {
      items: socios.map((s) => this.aListItem(s, cuentas.get(s.id))),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Socios con deuda vencida, del que más debe al que menos. La deuda se agrega primero
   * sobre las cuotas y recién después se traen los socios de la página.
   */
  private async listarMorosos({ q, loteoId, page, pageSize }: SocioListar): Promise<Paginado<SocioListItem>> {
    const where: Prisma.SocioWhereInput = {
      fechaBaja: null,
      ...(q && { OR: this.condicionesBusqueda(q) }),
      ...sociosDelLoteo(loteoId),
    };

    const candidatos = await this.prisma.socio.findMany({ where, select: { id: true } });
    if (candidatos.length === 0) return { items: [], total: 0, page, pageSize };

    // La deuda se suma fila por fila y no con un groupBy porque el interés por mora se
    // calcula al vuelo: ordenar por el importe pelado dejaría el ranking desfasado.
    const hoyISO = hoy();
    const [config, vencidas] = await Promise.all([
      this.interes.vigente(),
      this.prisma.cuota.findMany({
        where: {
          socioId: { in: candidatos.map((s) => s.id) },
          estado: 'PENDIENTE',
          vencimiento: { lt: aFecha(hoyISO) },
        },
        select: { socioId: true, importe: true, vencimiento: true, estado: true, origen: true },
      }),
    ]);

    const porSocio = new Map<number, number>();
    for (const c of vencidas) {
      const conInteres = c.importe + interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO);
      porSocio.set(c.socioId, (porSocio.get(c.socioId) ?? 0) + conInteres);
    }
    const deudas = [...porSocio.entries()].sort((a, b) => b[1] - a[1]);

    const pagina = deudas.slice((page - 1) * pageSize, page * pageSize).map(([socioId]) => socioId);
    const socios = await this.prisma.socio.findMany({
      where: { id: { in: pagina } },
      include: conParcelasVigentes,
    });
    const cuentas = await this.estadoDeCuenta(pagina);
    const porId = new Map(socios.map((s) => [s.id, s]));

    return {
      // El orden lo manda la deuda, no el apellido.
      items: pagina.flatMap((id) => {
        const socio = porId.get(id);
        return socio ? [this.aListItem(socio, cuentas.get(id))] : [];
      }),
      total: deudas.length,
      page,
      pageSize,
    };
  }

  async obtener(id: number): Promise<SocioDetalle> {
    const socio = await this.prisma.socio.findUnique({
      where: { id },
      include: {
        asignaciones: {
          orderBy: [{ hasta: { sort: 'desc', nulls: 'first' } }, { desde: 'desc' }],
          include: { parcela: parcelaResumen },
        },
      },
    });
    if (!socio) throw noEncontrado('No existe el socio');

    const vigentes = socio.asignaciones.filter((a) => a.hasta === null);
    const cuentas = await this.estadoDeCuenta([id]);
    return {
      ...this.aListItem({ ...socio, asignaciones: vigentes }, cuentas.get(id)),
      direccion: socio.direccion,
      observaciones: socio.observaciones,
      motivoBaja: socio.motivoBaja,
      fechaNacimiento: deFechaNullable(socio.fechaNacimiento),
      estadoCivil: socio.estadoCivil,
      confirmado: socio.confirmado,
      fotocopiaDni: socio.fotocopiaDni,
      actaMatrimonio: socio.actaMatrimonio,
      asignaciones: socio.asignaciones.map((a) => ({
        id: a.id,
        desde: deFecha(a.desde),
        hasta: deFechaNullable(a.hasta),
        parcela: { ...aParcelaUbicada(a.parcela), sector: a.parcela.sector },
      })),
    };
  }

  async crear(data: SocioCrear): Promise<SocioDetalle> {
    try {
      const socio = await this.prisma.$transaction(async (tx) => {
        const numero = data.numero ?? (await this.siguienteNumero(tx));
        const { fechaNacimiento, ...resto } = data;
        return tx.socio.create({
          data: {
            ...resto,
            numero,
            fechaAlta: aFecha(data.fechaAlta),
            fechaNacimiento: fechaNacimiento ? aFecha(fechaNacimiento) : null,
          },
        });
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

    // Un suplente está en lista de espera: por definición no tiene parcelas a su nombre.
    if (data.tipo === 'SUPLENTE' && actual.tipo !== 'SUPLENTE') {
      const vigentes = await this.prisma.asignacion.count({ where: { socioId: id, hasta: null } });
      if (vigentes > 0) {
        throw conflicto(
          `El socio tiene ${vigentes === 1 ? 'una parcela' : `${vigentes} parcelas`} a su nombre. ` +
            'Liberalas o transferilas antes de pasarlo a suplente.',
          'tipo',
        );
      }
    }

    const { numero, fechaAlta, fechaNacimiento, ...resto } = data;
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
          ...(fechaNacimiento !== undefined && { fechaNacimiento: fechaNacimiento ? aFecha(fechaNacimiento) : null }),
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

  /**
   * Deuda de cada socio: cuotas sin pagar y cuánto suman. «Vencida» se calcula contra la
   * fecha de hoy, así que no depende de que haya corrido ningún proceso.
   */
  private async estadoDeCuenta(socioIds: number[]): Promise<Map<number, EstadoCuenta>> {
    const cuentas = new Map<number, EstadoCuenta>();
    if (socioIds.length === 0) return cuentas;

    const hoyISO = hoy();
    const vencidasHasta = aFecha(hoyISO);
    const [config, pendientes] = await Promise.all([
      this.interes.vigente(),
      this.prisma.cuota.findMany({
        where: { socioId: { in: socioIds }, estado: 'PENDIENTE' },
        select: { socioId: true, importe: true, vencimiento: true, estado: true, origen: true },
      }),
    ]);

    for (const c of pendientes) {
      const cuenta = cuentas.get(c.socioId) ?? { ...SIN_DEUDA };
      // El interés por mora no es una cuota aparte: engrosa la que sigue impaga.
      const recargo = interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO);
      cuenta.pendientes += 1;
      cuenta.deuda += c.importe + recargo;
      cuenta.interes += recargo;
      if (c.vencimiento < vencidasHasta) {
        cuenta.vencidas += 1;
        cuenta.deudaVencida += c.importe + recargo;
      }
      cuentas.set(c.socioId, cuenta);
    }
    return cuentas;
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
    if (campos.includes('cuit')) return conflicto('Ya existe un socio con ese CUIT', 'cuit');
    if (campos.includes('numero')) return conflicto('Ya existe un socio con ese número', 'numero');
    return conflicto('Ya existe un socio con esos datos');
  }

  private aListItem(s: SocioConParcelas, estadoCuenta: EstadoCuenta = SIN_DEUDA): SocioListItem {
    return {
      id: s.id,
      numero: s.numero,
      tipo: s.tipo,
      nombre: s.nombre,
      apellido: s.apellido,
      dni: s.dni,
      cuit: s.cuit,
      email: s.email,
      telefono: s.telefono,
      fechaAlta: deFecha(s.fechaAlta),
      fechaBaja: deFechaNullable(s.fechaBaja),
      estado: s.fechaBaja ? 'baja' : 'activo',
      parcelas: s.asignaciones.map((a) => aParcelaUbicada(a.parcela)),
      estadoCuenta,
    };
  }
}
