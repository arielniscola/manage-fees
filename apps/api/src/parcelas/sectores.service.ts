import { Injectable } from '@nestjs/common';
import type { Sector, SectorActualizar, SectorCrear, SectorListar } from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conParcelas = {
  loteo: { select: { id: true, nombre: true } },
  _count: { select: { parcelas: true } },
} satisfies Prisma.SectorInclude;

type SectorConParcelas = Prisma.SectorGetPayload<{ include: typeof conParcelas }>;

/** Zonas del predio: «Lavalle», «Maipú». Es un catálogo chico que administra el club. */
@Injectable()
export class SectoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ loteoId }: SectorListar = {}): Promise<Sector[]> {
    const sectores = await this.prisma.sector.findMany({
      where: loteoId ? { loteoId } : {},
      include: conParcelas,
      orderBy: [{ loteo: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return sectores.map(aDTO);
  }

  async crear(data: SectorCrear): Promise<Sector> {
    try {
      const sector = await this.prisma.sector.create({ data, include: conParcelas });
      return aDTO(sector);
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  async actualizar(id: number, data: SectorActualizar): Promise<Sector> {
    await this.existe(id);
    try {
      return aDTO(await this.prisma.sector.update({ where: { id }, data, include: conParcelas }));
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
  }

  /** Un sector con parcelas no se elimina: primero hay que moverlas o dejarlas sin sector. */
  async eliminar(id: number): Promise<void> {
    const sector = await this.prisma.sector.findUnique({ where: { id }, include: conParcelas });
    if (!sector) throw noEncontrado('No existe el sector');
    if (sector._count.parcelas > 0) {
      const cuantas = sector._count.parcelas === 1 ? 'una parcela' : `${sector._count.parcelas} parcelas`;
      throw conflicto(`El sector tiene ${cuantas}. Movelas a otro sector antes de eliminarlo.`);
    }
    await this.prisma.sector.delete({ where: { id } });
  }

  private async existe(id: number) {
    if ((await this.prisma.sector.count({ where: { id } })) === 0) throw noEncontrado('No existe el sector');
  }

  /** El nombre es único dentro del loteo: la manzana 7 puede existir en dos loteos. */
  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya existe un sector con ese nombre en ese loteo', 'nombre') : e;
  }
}

const aDTO = (s: SectorConParcelas): Sector => ({
  id: s.id,
  nombre: s.nombre,
  loteo: s.loteo,
  descripcion: s.descripcion,
  parcelas: s._count.parcelas,
  puedeEliminar: s._count.parcelas === 0,
});
