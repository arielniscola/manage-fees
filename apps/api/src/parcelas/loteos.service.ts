import { Injectable } from '@nestjs/common';
import type { Loteo, LoteoActualizar, LoteoCrear } from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conSectores = {
  _count: { select: { sectores: true } },
  sectores: { select: { _count: { select: { parcelas: true } } } },
} satisfies Prisma.LoteoInclude;

type LoteoCompleto = Prisma.LoteoGetPayload<{ include: typeof conSectores }>;

/** Fraccionamientos del predio: el nivel de arriba de Loteo > Sector > Parcela. */
@Injectable()
export class LoteosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<Loteo[]> {
    const loteos = await this.prisma.loteo.findMany({ include: conSectores, orderBy: { nombre: 'asc' } });
    return loteos.map(aDTO);
  }

  async crear(data: LoteoCrear): Promise<Loteo> {
    try {
      return aDTO(await this.prisma.loteo.create({ data, include: conSectores }));
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  async actualizar(id: number, data: LoteoActualizar): Promise<Loteo> {
    await this.existe(id);
    try {
      return aDTO(await this.prisma.loteo.update({ where: { id }, data, include: conSectores }));
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  /** Un loteo con sectores no se elimina: primero hay que vaciarlo. */
  async eliminar(id: number): Promise<void> {
    const loteo = await this.prisma.loteo.findUnique({ where: { id }, include: conSectores });
    if (!loteo) throw noEncontrado('No existe el loteo');
    if (loteo._count.sectores > 0) {
      const cuantos = loteo._count.sectores === 1 ? 'un sector' : `${loteo._count.sectores} sectores`;
      throw conflicto(`El loteo tiene ${cuantos}. Movelos a otro loteo antes de eliminarlo.`);
    }
    await this.prisma.loteo.delete({ where: { id } });
  }

  private async existe(id: number) {
    if ((await this.prisma.loteo.count({ where: { id } })) === 0) throw noEncontrado('No existe el loteo');
  }

  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya existe un loteo con ese nombre', 'nombre') : e;
  }
}

const aDTO = (l: LoteoCompleto): Loteo => ({
  id: l.id,
  nombre: l.nombre,
  descripcion: l.descripcion,
  direccion: l.direccion,
  sectores: l._count.sectores,
  parcelas: l.sectores.reduce((t, s) => t + s._count.parcelas, 0),
  puedeEliminar: l._count.sectores === 0,
});
