import { Injectable } from '@nestjs/common';
import type {
  Paginado,
  ParcelaActualizar,
  ParcelaCrear,
  ParcelaDetalle,
  ParcelaListar,
  ParcelaListItem,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { deFecha, deFechaNullable } from '../common/fechas';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const socioResumen = { select: { id: true, numero: true, nombre: true, apellido: true } } as const;

const conTitular = {
  asignaciones: { where: { hasta: null }, include: { socio: socioResumen } },
  _count: { select: { asignaciones: true } },
} satisfies Prisma.ParcelaInclude;

type ParcelaConTitular = Prisma.ParcelaGetPayload<{ include: typeof conTitular }>;

@Injectable()
export class ParcelasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ q, estado, page, pageSize }: ParcelaListar): Promise<Paginado<ParcelaListItem>> {
    const where: Prisma.ParcelaWhereInput = {
      ...(estado === 'libre' && { asignaciones: { none: { hasta: null } } }),
      ...(estado === 'asignada' && { asignaciones: { some: { hasta: null } } }),
      ...(q && {
        OR: [
          { codigo: { contains: q, mode: 'insensitive' } },
          { sector: { contains: q, mode: 'insensitive' } },
          { descripcion: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, parcelas] = await this.prisma.$transaction([
      this.prisma.parcela.count({ where }),
      this.prisma.parcela.findMany({
        where,
        include: conTitular,
        orderBy: { codigo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: parcelas.map((p) => this.aListItem(p)), total, page, pageSize };
  }

  async obtener(id: number): Promise<ParcelaDetalle> {
    const parcela = await this.prisma.parcela.findUnique({ where: { id }, include: conTitular });
    if (!parcela) throw noEncontrado('No existe la parcela');

    const historial = await this.prisma.asignacion.findMany({
      where: { parcelaId: id },
      orderBy: [{ hasta: { sort: 'desc', nulls: 'first' } }, { desde: 'desc' }],
      include: { socio: socioResumen },
    });

    return {
      ...this.aListItem(parcela),
      asignaciones: historial.map((a) => ({
        id: a.id,
        desde: deFecha(a.desde),
        hasta: deFechaNullable(a.hasta),
        socio: a.socio,
      })),
    };
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

  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya existe una parcela con ese código', 'codigo') : e;
  }

  private aListItem(p: ParcelaConTitular): ParcelaListItem {
    const vigente = p.asignaciones[0];
    return {
      id: p.id,
      codigo: p.codigo,
      sector: p.sector,
      descripcion: p.descripcion,
      estado: vigente ? 'asignada' : 'libre',
      titular: vigente ? { ...vigente.socio, desde: deFecha(vigente.desde) } : null,
      puedeEliminar: p._count.asignaciones === 0,
    };
  }
}
