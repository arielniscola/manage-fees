import { Injectable } from '@nestjs/common';
import {
  ETIQUETA_ALCANCE,
  etiquetaPeriodo,
  mesActual,
  primerDia,
  sumarMeses,
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
   * de parcela— lleva el suyo, así que la vigente y el último período generado se calculan
   * por separado para cada uno. La de parcela, además, tiene un historial general y uno
   * por cada loteo con precio propio, cada uno con su vigente.
   */
  async listar({ alcance }: TarifaListar = {}): Promise<TarifaDTO[]> {
    const [tarifas, conteos, ultimoSocio, ultimoParcela] = await Promise.all([
      this.prisma.tarifa.findMany({
        where: alcance ? { alcance } : {},
        include: conLoteo,
        orderBy: [{ alcance: 'asc' }, { vigenteDesde: 'asc' }],
      }),
      this.prisma.cuota.groupBy({ by: ['tarifaId'], _count: { _all: true } }),
      this.ultimoPeriodoGenerado('SOCIO'),
      this.ultimoPeriodoGenerado('PARCELA'),
    ]);

    const porTarifa = new Map(conteos.map((c) => [c.tarifaId, c._count._all]));
    const ultimoPeriodo = { SOCIO: ultimoSocio, PARCELA: ultimoParcela };
    const hoy = mesActual();
    // La vigente de cada historial es la última que ya empezó a regir.
    const ultimaPorHistorial = new Map<string, number>();
    for (const t of tarifas) if (mesVigencia(t) <= hoy) ultimaPorHistorial.set(historial(t), t.id);
    const vigentes = new Set(ultimaPorHistorial.values());

    return tarifas
      .map((t) =>
        this.aDTO(t, {
          vigente: vigentes.has(t.id),
          cuotas: porTarifa.get(t.id) ?? 0,
          ultimoPeriodo: ultimoPeriodo[t.alcance],
        }),
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
    await this.validarVigencia(data.alcance, data.vigenteDesde);
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
    return this.buscarEnLista(data.alcance, data.loteoId, data.vigenteDesde);
  }

  /** Solo se toca una tarifa que todavía no generó ninguna cuota. */
  async actualizar(id: number, data: TarifaActualizar): Promise<TarifaDTO> {
    const actual = await this.exigirEditable(id);
    // Ni el alcance ni el loteo se cambian: sería mover la tarifa de historial y pisar otro período.
    if (data.vigenteDesde && data.vigenteDesde !== mesVigencia(actual)) {
      await this.validarVigencia(actual.alcance, data.vigenteDesde);
    }

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
    return this.buscarEnLista(actual.alcance, actual.loteoId, data.vigenteDesde ?? mesVigencia(actual));
  }

  async eliminar(id: number): Promise<void> {
    await this.exigirEditable(id);
    await this.prisma.tarifa.delete({ where: { id } });
  }

  /**
   * Período más nuevo con cuotas ya generadas de ese alcance, o null si todavía no se generó
   * ninguna. La cuota social y la de parcela avanzan por separado.
   */
  async ultimoPeriodoGenerado(alcance: AlcanceTarifa): Promise<string | null> {
    const { _max } = await this.prisma.cuota.aggregate({
      where: { origen: alcance === 'SOCIO' ? 'SOCIO' : 'PARCELA' },
      _max: { periodo: true },
    });
    return _max.periodo;
  }

  /**
   * Una tarifa nueva no puede pisar períodos ya generados: un cambio de valor
   * solo afecta a las cuotas futuras.
   */
  private async validarVigencia(alcance: AlcanceTarifa, mes: string): Promise<void> {
    const ultimo = await this.ultimoPeriodoGenerado(alcance);
    if (ultimo && mes <= ultimo) {
      const tarifa = await this.prisma.tarifa.findFirst({ where: { alcance }, orderBy: { vigenteDesde: 'desc' } });
      const periodicidad = tarifa?.periodicidad ?? 'MENSUAL';
      throw reglaIncumplida(
        `Ya hay ${ETIQUETA_ALCANCE[alcance].toLowerCase()}s generadas hasta ${etiquetaPeriodo(ultimo, periodicidad)}. ` +
          `La nueva tarifa tiene que regir desde ${etiquetaPeriodo(sumarMeses(ultimo, 1), 'MENSUAL')} o más adelante.`,
        'vigenteDesde',
      );
    }
  }

  private async exigirEditable(id: number): Promise<Tarifa> {
    const tarifa = await this.prisma.tarifa.findUnique({ where: { id } });
    if (!tarifa) throw noEncontrado('No existe la tarifa');

    const ultimo = await this.ultimoPeriodoGenerado(tarifa.alcance);
    if (ultimo && mesVigencia(tarifa) <= ultimo) {
      throw conflicto('La tarifa ya generó cuotas: para cambiar el valor, cargá una tarifa nueva con su mes de vigencia');
    }
    return tarifa;
  }

  /** Devuelve la tarifa recién guardada con sus datos calculados (vigente, futura, etc.). */
  private async buscarEnLista(alcance: AlcanceTarifa, loteoId: number | null, mes: string): Promise<TarifaDTO> {
    const lista = await this.listar({ alcance });
    return lista.find((t) => (t.loteo?.id ?? null) === loteoId && t.vigenteDesde === mes)!;
  }

  private aDTO(
    t: TarifaConLoteo,
    ctx: { vigente: boolean; cuotas: number; ultimoPeriodo: string | null },
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
      puedeEditar: !ctx.ultimoPeriodo || vigenteDesde > ctx.ultimoPeriodo,
    };
  }

  private traducirDuplicado(e: unknown): unknown {
    return esDuplicado(e) ? conflicto('Ya hay una tarifa de esa cuota y ese loteo que rige desde ese mes', 'vigenteDesde') : e;
  }
}
