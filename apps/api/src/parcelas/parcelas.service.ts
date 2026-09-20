import { Injectable } from '@nestjs/common';
import { etiquetaParcela, hoy, interesDeCuota } from '@mf/shared';
import type {
  EstadoCuenta,
  Paginado,
  ParcelaActualizar,
  ParcelaCrear,
  ParcelaDetalle,
  ParcelaListar,
  ParcelaListItem,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { aFecha, deFecha, deFechaNullable } from '../common/fechas';
import { aParcelaUbicada, parcelaResumen, sectorResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const socioResumen = { select: { id: true, numero: true, nombre: true, apellido: true } } as const;

const conTitular = {
  asignaciones: { where: { hasta: null }, include: { socio: socioResumen } },
  sector: sectorResumen,
  _count: { select: { asignaciones: true } },
} satisfies Prisma.ParcelaInclude;

type ParcelaConTitular = Prisma.ParcelaGetPayload<{ include: typeof conTitular }>;

@Injectable()
export class ParcelasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interes: InteresService,
  ) {}

  async listar({ q, estado, sectorId, loteoId, page, pageSize }: ParcelaListar): Promise<Paginado<ParcelaListItem>> {
    const where: Prisma.ParcelaWhereInput = {
      ...(estado === 'libre' && { asignaciones: { none: { hasta: null } } }),
      ...(estado === 'asignada' && { asignaciones: { some: { hasta: null } } }),
      ...(sectorId && { sectorId }),
      ...(loteoId && { sector: { loteoId } }),
      ...(q && {
        OR: [
          { codigo: { contains: q, mode: 'insensitive' } },
          { sector: { nombre: { contains: q, mode: 'insensitive' } } },
          { sector: { loteo: { nombre: { contains: q, mode: 'insensitive' } } } },
          { descripcion: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, parcelas] = await this.prisma.$transaction([
      this.prisma.parcela.count({ where }),
      this.prisma.parcela.findMany({
        where,
        include: conTitular,
        orderBy: [{ sector: { loteo: { nombre: 'asc' } } }, { sector: { nombre: 'asc' } }, { codigo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: parcelas.map((p) => this.aListItem(p)), total, page, pageSize };
  }

  async obtener(id: number): Promise<ParcelaDetalle> {
    const parcela = await this.prisma.parcela.findUnique({ where: { id }, include: conTitular });
    if (!parcela) throw noEncontrado('No existe la parcela');

    const [historial, transferencias, cuenta] = await Promise.all([
      this.prisma.asignacion.findMany({
        where: { parcelaId: id },
        orderBy: [{ hasta: { sort: 'desc', nulls: 'first' } }, { desde: 'desc' }],
        include: {
          socio: socioResumen,
          // Para poder decir si la titularidad terminó (o empezó) por una transferencia.
          cedidaEn: { include: { aSocio: socioResumen } },
          recibidaEn: { include: { deSocio: socioResumen } },
        },
      }),
      this.prisma.transferencia.findMany({
        where: { parcelaId: id },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        include: {
          parcela: parcelaResumen,
          deSocio: socioResumen,
          aSocio: socioResumen,
          usuario: { select: { nombre: true } },
        },
      }),
      this.estadoDeCuenta(id),
    ]);

    return {
      ...this.aListItem(parcela),
      ...cuenta,
      asignaciones: historial.map((a) => ({
        id: a.id,
        desde: deFecha(a.desde),
        hasta: deFechaNullable(a.hasta),
        socio: a.socio,
        transferidaA: a.cedidaEn?.aSocio ?? null,
        recibidaDe: a.recibidaEn?.deSocio ?? null,
      })),
      transferencias: transferencias.map((t) => ({
        id: t.id,
        fecha: deFecha(t.fecha),
        parcela: aParcelaUbicada(t.parcela),
        de: t.deSocio,
        a: t.aSocio,
        motivo: t.motivo,
        registradaPor: t.usuario.nombre,
        registradaEn: t.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Deuda y cobros de una parcela. La deuda es la de sus cuotas, con el interés por mora
   * del día; lo cobrado sale de los renglones de cobro, que ya guardan el interés que se
   * cobró en su momento.
   */
  private async estadoDeCuenta(parcelaId: number): Promise<{ estadoCuenta: EstadoCuenta; cobrado: number }> {
    const hoyISO = hoy();
    const corte = aFecha(hoyISO);
    const [config, pendientes, cobros] = await Promise.all([
      this.interes.vigente(),
      this.prisma.cuota.findMany({
        where: { parcelaId, estado: 'PENDIENTE' },
        select: { importe: true, vencimiento: true, estado: true, origen: true },
      }),
      this.prisma.cobroDetalle.aggregate({
        where: { cuota: { parcelaId }, cobro: { anuladoEn: null } },
        _sum: { importe: true },
      }),
    ]);

    const estadoCuenta: EstadoCuenta = { pendientes: 0, vencidas: 0, deuda: 0, deudaVencida: 0, interes: 0 };
    for (const c of pendientes) {
      const recargo = interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO);
      estadoCuenta.pendientes += 1;
      estadoCuenta.deuda += c.importe + recargo;
      estadoCuenta.interes += recargo;
      if (c.vencimiento < corte) {
        estadoCuenta.vencidas += 1;
        estadoCuenta.deudaVencida += c.importe + recargo;
      }
    }
    return { estadoCuenta, cobrado: cobros._sum.importe ?? 0 };
  }

  async crear(data: ParcelaCrear): Promise<ParcelaDetalle> {
    try {
      const parcela = await this.prisma.parcela.create({ data });
      return this.obtener(parcela.id);
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  async actualizar(id: number, data: ParcelaActualizar): Promise<ParcelaDetalle> {
    await this.existe(id);
    try {
      await this.prisma.parcela.update({ where: { id }, data });
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
    return this.obtener(id);
  }

  /** Solo se eliminan parcelas cargadas por error, que nunca tuvieron titular. */
  async eliminar(id: number): Promise<void> {
    const parcela = await this.prisma.parcela.findUnique({
      where: { id },
      include: { _count: { select: { asignaciones: true } } },
    });
    if (!parcela) throw noEncontrado('No existe la parcela');
    if (parcela._count.asignaciones > 0) {
      throw conflicto('La parcela tiene historial de asignaciones y no se puede eliminar');
    }
    await this.prisma.parcela.delete({ where: { id } });
  }

  private async existe(id: number) {
    const n = await this.prisma.parcela.count({ where: { id } });
    if (!n) throw noEncontrado('No existe la parcela');
  }

  /** El código es único dentro del sector: el mismo «7-1» puede existir en otro loteo. */
  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya existe una parcela con ese código en ese sector', 'codigo') : e;
  }

  private aListItem(p: ParcelaConTitular): ParcelaListItem {
    const vigente = p.asignaciones[0];
    return {
      id: p.id,
      codigo: p.codigo,
      etiqueta: etiquetaParcela(p),
      sector: p.sector,
      superficieM2: p.superficieM2 === null ? null : Number(p.superficieM2),
      descripcion: p.descripcion,
      estado: vigente ? 'asignada' : 'libre',
      titular: vigente ? { ...vigente.socio, desde: deFecha(vigente.desde) } : null,
      puedeEliminar: p._count.asignaciones === 0,
    };
  }
}
