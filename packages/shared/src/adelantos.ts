import { z } from 'zod';
import { mesSchema, type OrigenCuota } from './cuotas';
import { mesesEntre, type Periodicidad } from './periodos';
import type { ParcelaUbicada } from './parcelas';

/**
 * Adelantar cuotas: el socio que viene a pagar puede llevarse también los períodos que
 * todavía no se generaron. Las cuotas futuras no existen hasta ese momento —el sistema
 * genera hasta el período en curso— así que se crean y se cobran en el mismo acto: nunca
 * queda una cuota futura impaga sumando a la deuda del socio ni saliendo en los avisos.
 *
 * El club decide hasta cuántos meses se puede adelantar y si eso lleva un descuento.
 */

/** Tope duro: por más que se configure otra cosa, no se adelanta más de esto. */
export const MAX_MESES_ADELANTO = 36;

/** Tope de cuotas que puede crear un solo adelanto, para no armar un recibo interminable. */
export const MAX_CUOTAS_ADELANTO = 120;

export interface ConfiguracionAdelanto {
  /** Con esto apagado, registrar pago no ofrece adelantar nada. */
  activo: boolean;
  /** Cuántos meses hacia adelante se puede llegar como mucho. */
  mesesMaximos: number;
  /** Descuento por pago adelantado, en porcentaje sobre el importe de cada cuota adelantada. */
  descuento: number;
  /** Meses de adelanto a partir de los cuales corresponde el descuento. */
  minimoMeses: number;
  actualizadoEn: string;
}

export const configuracionAdelantoSchema = z
  .object({
    activo: z.boolean().default(true),
    mesesMaximos: z.coerce
      .number({ invalid_type_error: 'Ingresá los meses' })
      .int('Los meses tienen que ser un número entero')
      .min(1, 'Tiene que ser al menos 1 mes')
      .max(MAX_MESES_ADELANTO, `Como mucho ${MAX_MESES_ADELANTO} meses`),
    descuento: z.preprocess(
      (v) => (typeof v === 'string' ? v.replace(',', '.') : v),
      z.coerce
        .number({ invalid_type_error: 'Ingresá el porcentaje' })
        .min(0, 'El porcentaje no puede ser negativo')
        .max(100, 'El porcentaje no puede pasar de 100')
        // Dos decimales, igual que el interés: 1,5 % sí, 1,555 % no.
        .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, { message: 'Como mucho dos decimales' }),
    ),
    minimoMeses: z.coerce
      .number({ invalid_type_error: 'Ingresá los meses' })
      .int('Los meses tienen que ser un número entero')
      .min(1, 'Tiene que ser al menos 1 mes')
      .max(MAX_MESES_ADELANTO, `Como mucho ${MAX_MESES_ADELANTO} meses`),
  })
  .refine((c) => c.minimoMeses <= c.mesesMaximos, {
    message: 'No puede pedir más meses de los que se permiten adelantar',
    path: ['minimoMeses'],
  });
export type ConfiguracionAdelantoInput = z.input<typeof configuracionAdelantoSchema>;
export type ConfiguracionAdelantoGuardar = z.output<typeof configuracionAdelantoSchema>;

/**
 * Descuento de una cuota adelantada, en centavos. Se calcula sobre el importe de la
 * cuota y depende de cuántos meses se adelanta en total, no de qué período sea cada una:
 * quien paga el año entero tiene el mismo descuento en la primera cuota que en la última.
 */
export function descuentoDeAdelanto(
  importe: number,
  config: Pick<ConfiguracionAdelanto, 'activo' | 'descuento' | 'minimoMeses'> | null,
  meses: number,
): number {
  if (!config?.activo || config.descuento <= 0) return 0;
  if (meses < config.minimoMeses) return 0;
  return Math.round((importe * config.descuento) / 100);
}

/** Meses de adelanto: del mes en curso al último mes que se paga. */
export const mesesDeAdelanto = (desdeMes: string, hastaMes: string): number => mesesEntre(desdeMes, hastaMes);

/**
 * Nombre estable de una cuota que todavía no existe: con esto la pantalla puede sacar
 * un renglón del adelanto —la cuota social de un mes, la de una parcela— y el servidor
 * sabe cuál es sin que nadie le mande importes.
 */
export function claveAdelanto(cuota: { origen: OrigenCuota; parcela: { id: number } | null; periodo: string }): string {
  return cuota.origen === 'PARCELA' ? `PARCELA|${cuota.parcela?.id ?? 0}|${cuota.periodo}` : `SOCIO|${cuota.periodo}`;
}

/** Una de las cuotas que se crearían al adelantar. Todavía no existe en la base. */
export interface CuotaAdelantada {
  /** Cómo se la nombra para dejarla afuera del adelanto. Ver `claveAdelanto`. */
  clave: string;
  periodo: string;
  periodicidad: Periodicidad;
  /** El concepto listo para mostrar: 'octubre 2026', 'Cuota social octubre 2026'. */
  etiqueta: string;
  origen: OrigenCuota;
  /** Null en la cuota social, que no cuelga de ninguna parcela. */
  parcela: ParcelaUbicada | null;
  vencimiento: string;
  /** Importe de la cuota según la tarifa que rija en su período. */
  importe: number;
  /** Lo que se descuenta por adelantarla, en centavos. 0 si no corresponde. */
  descuento: number;
}

/** Vista previa del adelanto: qué se crearía y cuánto se cobraría. No escribe nada. */
export interface ResultadoAdelanto {
  /** Último mes que se paga, 'AAAA-MM'. */
  hasta: string;
  /** Meses de adelanto contados desde el mes en curso. */
  meses: number;
  cuotas: CuotaAdelantada[];
  /** Suma de los importes de todas las cuotas, sin descuento. */
  importe: number;
  /** Cuánto se descuenta en total. */
  descuento: number;
  /** Lo que se cobra: importe menos descuento. */
  total: number;
  /** La configuración vigente, para que la pantalla sepa qué ofrecer. */
  activo: boolean;
  mesesMaximos: number;
  minimoMeses: number;
  /** Porcentaje de descuento configurado; 0 si no hay. */
  porcentaje: number;
  /** Aplicado o no a estas cuotas: con menos meses que el mínimo no corresponde. */
  conDescuento: boolean;
}

/** Los totales de un adelanto al que se le sacaron renglones. */
export function totalesDeAdelanto(cuotas: CuotaAdelantada[], excluidas: readonly string[] = []) {
  const incluidas = cuotas.filter((c) => !excluidas.includes(c.clave));
  const importe = incluidas.reduce((t, c) => t + c.importe, 0);
  const descuento = incluidas.reduce((t, c) => t + c.descuento, 0);
  return { cuotas: incluidas, cantidad: incluidas.length, importe, descuento, total: importe - descuento };
}

/** Filtro de la vista previa: hasta qué mes quiere pagar el socio. */
export const adelantoPrevioSchema = z.object({ hasta: mesSchema });
export type AdelantoPrevioInput = z.input<typeof adelantoPrevioSchema>;
export type AdelantoPrevio = z.output<typeof adelantoPrevioSchema>;
