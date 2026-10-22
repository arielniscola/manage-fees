import { Injectable } from '@nestjs/common';
import {
  mesActual,
  primerDia,
  type AlcanceTarifa,
  type Tarifa as TarifaDTO,
  type TarifaActualizar,
  type TarifaCrear,
  type TarifaListar,
} from '@mf/shared';
import type { Prisma, Tarifa } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha } from '../common/fechas';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

const conLoteo = { loteo: { select: { id: true, nombre: true } } } satisfies Prisma.TarifaInclude;
type TarifaConLoteo = Prisma.TarifaGetPayload<{ include: typeof conLoteo }>;

/** El historial al que pertenece una tarifa: el general de su alcance o el de su loteo. */
const historial = (t: Pick<Tarifa, 'alcance' | 'loteoId'>): string => `${t.alcance}|${t.loteoId ?? 'general'}`;

/** Mes de vigencia de una tarifa, 'AAAA-MM'. */
export const mesVigencia = (t: Tarifa): string => deFecha(t.vigenteDesde).slice(0, 7);

@Injectable()
export class TarifasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Historial completo, de la más nueva a la más vieja. Cada alcance —la cuota social y la
   * de parcela— lleva el suyo, y la de parcela, además, tiene un historial general y uno
   * por cada loteo con precio propio. La vigente se calcula por separado para cada historial.
   */
  async listar({ alcance }: TarifaListar = {}): Promise<TarifaDTO[]> {
    const [tarifas, conteos] = await Promise.all([
      this.prisma.tarifa.findMany({
        where: alcance ? { alcance } : {},
        include: conLoteo,
        orderBy: [{ alcance: 'asc' }, { vigenteDesde: 'asc' }],
      }),
      this.prisma.cuota.groupBy({ by: ['tarifaId'], _count: { _all: true } }),
    ]);

    const porTarifa = new Map(conteos.map((c) => [c.tarifaId, c._count._all]));
    const hoy = mesActual();
    // La vigente de cada historial es la última activa que ya empezó a regir.
    const ultimaPorHistorial = new Map<string, number>();
    for (const t of tarifas) if (t.activa && mesVigencia(t) <= hoy) ultimaPorHistorial.set(historial(t), t.id);
    const vigentes = new Set(ultimaPorHistorial.values());

    return tarifas
      .map((t) =>
        this.aDTO(t, { vigente: vigentes.has(t.id), cuotas: porTarifa.get(t.id) ?? 0 }),
      )
      .reverse();
  }

  async crear(data: TarifaCrear): Promise<TarifaDTO> {
    if (data.loteoId !== null) {
      if (data.alcance !== 'PARCELA') {
        throw reglaIncumplida('La cuota social es una sola para todos: no lleva loteo', 'loteoId');
      }
      if ((await this.prisma.loteo.count({ where: { id: data.loteoId } })) === 0) {
        throw noEncontrado('No existe el loteo');
      }
    }
    // La vigencia puede caer sobre períodos ya generados: esas cuotas guardan su importe y la
    // generación no las vuelve a crear, así que la tarifa nueva solo valoriza los que falten.
    try {
      await this.prisma.tarifa.create({
        data: {
          alcance: data.alcance,
          loteoId: data.loteoId,
          importe: data.importe,
          periodicidad: data.periodicidad,
          diaVencimiento: data.diaVencimiento,
          vigenteDesde: aFecha(primerDia(data.vigenteDesde)),
        },
      });
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
    return this.buscarEnLista({ alcance: data.alcance, loteoId: data.loteoId, mes: data.vigenteDesde });
  }

  /** Solo se toca una tarifa que todavía no generó ninguna cuota propia. */
  async actualizar(id: number, data: TarifaActualizar): Promise<TarifaDTO> {
    const actual = await this.exigirEditable(id);
    // Ni el alcance ni el loteo se cambian: sería mover la tarifa de historial y pisar otro período.

    try {
      await this.prisma.tarifa.update({
        where: { id },
        data: {
          ...(data.importe !== undefined && { importe: data.importe }),
          ...(data.periodicidad !== undefined && { periodicidad: data.periodicidad }),
          ...(data.diaVencimiento !== undefined && { diaVencimiento: data.diaVencimiento }),
          ...(data.vigenteDesde !== undefined && { vigenteDesde: aFecha(primerDia(data.vigenteDesde)) }),
        },
      });
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
    return this.buscarEnLista({ alcance: actual.alcance, loteoId: actual.loteoId, mes: data.vigenteDesde ?? mesVigencia(actual) });
  }

  async eliminar(id: number): Promise<void> {
    await this.exigirEditable(id);
    await this.prisma.tarifa.delete({ where: { id } });
  }

  /**
   * La baja de una tarifa que ya generó cuotas: deja de valorizar los períodos que todavía
   * no se generaron y su historial sigue con las demás activas —un loteo sin ninguna vuelve
   * a la general—. Las cuotas que ya generó no cambian.
   */
  async desactivar(id: number): Promise<TarifaDTO> {
    const tarifa = await this.prisma.tarifa.findUnique({ where: { id } });
    if (!tarifa) throw noEncontrado('No existe la tarifa');
    if (!tarifa.activa) throw conflicto('La tarifa ya está desactivada');
    await this.prisma.tarifa.update({ where: { id }, data: { activa: false } });
    return this.buscarEnLista({ alcance: tarifa.alcance, id });
  }

  /** Vuelve a sumar la tarifa a su historial, para los períodos que todavía no se generaron. */
  async reactivar(id: number): Promise<TarifaDTO> {
    const tarifa = await this.prisma.tarifa.findUnique({ where: { id } });
    if (!tarifa) throw noEncontrado('No existe la tarifa');
    if (tarifa.activa) throw conflicto('La tarifa ya está activa');
    try {
      await this.prisma.tarifa.update({ where: { id }, data: { activa: true } });
    } catch (e) {
      throw this.traducirDuplicado(e);
    }
    return this.buscarEnLista({ alcance: tarifa.alcance, id });
  }

  private async exigirEditable(id: number): Promise<Tarifa> {
    const tarifa = await this.prisma.tarifa.findUnique({ where: { id } });
    if (!tarifa) throw noEncontrado('No existe la tarifa');
    if (!tarifa.activa) throw conflicto('La tarifa está desactivada: reactivala para poder cambiarla');

    if ((await this.prisma.cuota.count({ where: { tarifaId: id } })) > 0) {
      throw conflicto('La tarifa ya generó cuotas: para cambiar el valor, cargá una tarifa nueva con su mes de vigencia');
    }
    return tarifa;
  }

  /**
   * Devuelve la tarifa recién guardada con sus datos calculados (vigente, futura, etc.):
   * por su id, o por historial y mes, que entre las activas es único.
   */
  private async buscarEnLista(
    busca: { alcance: AlcanceTarifa } & ({ id: number } | { loteoId: number | null; mes: string }),
  ): Promise<TarifaDTO> {
    const lista = await this.listar({ alcance: busca.alcance });
    return lista.find((t) =>
      'id' in busca ? t.id === busca.id : t.activa && (t.loteo?.id ?? null) === busca.loteoId && t.vigenteDesde === busca.mes,
    )!;
  }

  private aDTO(
    t: TarifaConLoteo,
    ctx: { vigente: boolean; cuotas: number },
  ): TarifaDTO {
    const vigenteDesde = mesVigencia(t);
    return {
      id: t.id,
      alcance: t.alcance,
      loteo: t.loteo,
      importe: t.importe,
      periodicidad: t.periodicidad,
      diaVencimiento: t.diaVencimiento,
      vigenteDesde,
      vigente: ctx.vigente,
      futura: vigenteDesde > mesActual(),
      cuotasGeneradas: ctx.cuotas,
      activa: t.activa,
      puedeEditar: t.activa && ctx.cuotas === 0,
    };
  }

  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya hay una tarifa de esa cuota y ese loteo que rige desde ese mes', 'vigenteDesde') : e;
  }
}
