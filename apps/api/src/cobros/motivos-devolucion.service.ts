import { Injectable } from '@nestjs/common';
import type { MotivoDevolucion, MotivoDevolucionActualizar, MotivoDevolucionDatos } from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conUsos = { _count: { select: { devoluciones: true } } } satisfies Prisma.MotivoDevolucionInclude;

/** La lista de motivos que se ofrece al registrar una devolución. */
@Injectable()
export class MotivosDevolucionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Los activos primero, cada grupo por nombre. */
  async listar(): Promise<MotivoDevolucion[]> {
    const motivos = await this.prisma.motivoDevolucion.findMany({
      include: conUsos,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return motivos.map(aDTO);
  }

  async crear({ nombre }: MotivoDevolucionDatos): Promise<MotivoDevolucion> {
    await this.verificarNombreLibre(nombre);
    try {
      return aDTO(await this.prisma.motivoDevolucion.create({ data: { nombre }, include: conUsos }));
    } catch (e) {
      if (esDuplicado(e)) throw conflicto('Ya existe un motivo con ese nombre', 'nombre');
      throw e;
    }
  }

  /**
   * Renombrar no toca las devoluciones ya hechas: guardan el texto con que se registraron.
   * Uno usado no se borra; se desactiva y deja de ofrecerse.
   */
  async actualizar(id: number, datos: MotivoDevolucionActualizar): Promise<MotivoDevolucion> {
    const actual = await this.prisma.motivoDevolucion.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('No existe el motivo');
    if (datos.nombre !== undefined) await this.verificarNombreLibre(datos.nombre, id);
    try {
      return aDTO(await this.prisma.motivoDevolucion.update({ where: { id }, data: datos, include: conUsos }));
    } catch (e) {
      if (esDuplicado(e)) throw conflicto('Ya existe un motivo con ese nombre', 'nombre');
      throw e;
    }
  }

  /** «Pago duplicado» y «pago duplicado» serían el mismo motivo en la lista. */
  private async verificarNombreLibre(nombre: string, salvoId?: number) {
    const otro = await this.prisma.motivoDevolucion.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(salvoId && { id: { not: salvoId } }) },
      select: { nombre: true },
    });
    if (otro) throw conflicto(`Ya existe el motivo «${otro.nombre}»`, 'nombre');
  }
}

function aDTO(m: Prisma.MotivoDevolucionGetPayload<{ include: typeof conUsos }>): MotivoDevolucion {
  return { id: m.id, nombre: m.nombre, activo: m.activo, usos: m._count.devoluciones };
}
