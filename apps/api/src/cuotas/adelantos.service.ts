import { Injectable } from '@nestjs/common';
import {
  claveAdelanto,
  conceptoCuota,
  descuentoDeAdelanto,
  mesActual,
  mesesEntre,
  MAX_CUOTAS_ADELANTO,
  type ConfiguracionAdelanto,
  type CuotaAdelantada,
  type ResultadoAdelanto,
} from '@mf/shared';
import type { Prisma } from '@prisma/client';
import { reglaIncumplida } from '../common/errores';
import { deFecha } from '../common/fechas';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { AdelantoService } from '../configuracion/adelanto.service';
import { PrismaService } from '../prisma/prisma.module';
import { GeneracionService, type Candidata } from './generacion.service';

/**
 * Adelantar cuotas. Las cuotas futuras no existen hasta que alguien las adelanta: la
 * generación llega hasta el período en curso. Así que acá se calculan al vuelo para la
 * vista previa, y recién se crean dentro de la transacción del cobro que las cancela.
 * Nunca queda una cuota futura impaga sumando a la deuda del socio ni saliendo en los
 * avisos de vencimiento.
 */
@Injectable()
export class AdelantosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generacion: GeneracionService,
    private readonly config: AdelantoService,
  ) {}

  /** Qué cuotas se crearían y cuánto se cobraría. No escribe nada. */
  async previsualizar(socioId: number, hastaMes: string): Promise<ResultadoAdelanto> {
    const { config, meses, candidatas } = await this.calcular(socioId, hastaMes, this.prisma);
    const parcelas = await this.parcelasDe(candidatas, this.prisma);
    const cuotas = candidatas.map((c) => aCuotaAdelantada(c, parcelas, config, meses));

    const importe = cuotas.reduce((t, c) => t + c.importe, 0);
    const descuento = cuotas.reduce((t, c) => t + c.descuento, 0);
    return {
      hasta: hastaMes,
      meses,
      cuotas,
      importe,
      descuento,
      total: importe - descuento,
      activo: config.activo,
      mesesMaximos: config.mesesMaximos,
      minimoMeses: config.minimoMeses,
      porcentaje: config.descuento,
      conDescuento: descuento > 0,
    };
  }

  /**
   * Crea las cuotas adelantadas dentro de la transacción del cobro y devuelve sus ids con
   * el descuento que le toca a cada una. Si el cobro falla, las cuotas no quedan.
   */
  async preparar(
    tx: Prisma.TransactionClient,
    socioId: number,
    hastaMes: string,
    excepto: readonly string[] = [],
  ): Promise<{ ids: number[]; descuentos: Map<number, number> }> {
    const { config, meses, candidatas } = await this.calcular(socioId, hastaMes, tx);
    if (candidatas.length === 0) {
      throw reglaIncumplida('No hay cuotas para adelantar hasta ese mes: ya están todas generadas', 'adelantarHasta');
    }

    // Los renglones que el cobrador sacó no se crean: ese período se va a generar como
    // siempre cuando llegue. Si los sacó a todos, el cobro queda con las cuotas tildadas.
    const fuera = new Set(excepto);
    const aCrear = candidatas.filter((c) => !fuera.has(claveDe(c)));
    if (aCrear.length === 0) return { ids: [], descuentos: new Map() };

    const creadas = await tx.cuota.createManyAndReturn({
      data: aCrear.map((c) => ({ ...c, adelantada: true })),
      select: { id: true, importe: true },
    });

    return {
      ids: creadas.map((c) => c.id),
      descuentos: new Map(creadas.map((c) => [c.id, descuentoDeAdelanto(c.importe, config, meses)])),
    };
  }

  /** Las validaciones y el cálculo, iguales para la vista previa y para el cobro. */
  private async calcular(
    socioId: number,
    hastaMes: string,
    db: Prisma.TransactionClient,
  ): Promise<{ config: ConfiguracionAdelanto; meses: number; candidatas: Candidata[] }> {
    const config = await this.config.obtener();
    if (!config.activo) throw reglaIncumplida('Los pagos adelantados están desactivados', 'adelantarHasta');

    const meses = mesesEntre(mesActual(), hastaMes);
    if (meses <= 0) throw reglaIncumplida('Para adelantar, elegí un mes posterior al actual', 'adelantarHasta');
    if (meses > config.mesesMaximos) {
      throw reglaIncumplida(`No se puede adelantar más de ${config.mesesMaximos} meses`, 'adelantarHasta');
    }

    const candidatas = await this.generacion.candidatasDeSocio(socioId, hastaMes, db);
    if (candidatas.length > MAX_CUOTAS_ADELANTO) {
      throw reglaIncumplida(
        `Son ${candidatas.length} cuotas para un solo recibo: adelantá menos meses`,
        'adelantarHasta',
      );
    }
    return { config, meses, candidatas };
  }

  /** Las parcelas que aparecen en las candidatas, para poder nombrarlas en la vista previa. */
  private async parcelasDe(candidatas: Candidata[], db: Prisma.TransactionClient) {
    const ids = [...new Set(candidatas.flatMap((c) => (typeof c.parcelaId === 'number' ? [c.parcelaId] : [])))];
    if (ids.length === 0) return new Map<number, ReturnType<typeof aParcelaUbicada>>();
    const parcelas = await db.parcela.findMany({ where: { id: { in: ids } }, ...parcelaResumen });
    return new Map(parcelas.map((p) => [p.id, aParcelaUbicada(p)]));
  }
}

/** La misma clave que ve la pantalla, calculada sobre una candidata. */
const claveDe = (c: Candidata): string =>
  claveAdelanto({
    origen: c.origen,
    parcela: typeof c.parcelaId === 'number' ? { id: c.parcelaId } : null,
    periodo: c.periodo,
  });

function aCuotaAdelantada(
  c: Candidata,
  parcelas: Map<number, ReturnType<typeof aParcelaUbicada>>,
  config: ConfiguracionAdelanto,
  meses: number,
): CuotaAdelantada {
  const parcelaId = typeof c.parcelaId === 'number' ? c.parcelaId : null;
  return {
    clave: claveDe(c),
    periodo: c.periodo,
    periodicidad: c.periodicidad,
    etiqueta: conceptoCuota({ origen: c.origen, periodo: c.periodo, periodicidad: c.periodicidad, plan: null }),
    origen: c.origen,
    parcela: (parcelaId !== null && parcelas.get(parcelaId)) || null,
    vencimiento: c.vencimiento instanceof Date ? deFecha(c.vencimiento) : String(c.vencimiento),
    importe: c.importe,
    descuento: descuentoDeAdelanto(c.importe, config, meses),
  };
}
