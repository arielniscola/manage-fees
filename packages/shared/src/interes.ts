import { z } from 'zod';
import { diasDelMes, sumarMeses } from './periodos';

/**
 * Interés por mora. El club configura un porcentaje, el día del mes en que se aplica y el
 * modo. En modo mensual, cada vez que llega ese día y la cuota sigue impaga se le suma otra
 * vez el porcentaje calculado sobre su importe original (interés simple, no compuesto). En
 * modo único se aplica una sola vez, el primer día de aplicación después del vencimiento.
 *
 * No se guarda como cuota ni como columna: se calcula al vuelo cada vez que se muestra
 * la deuda, y recién queda congelado en el detalle del cobro cuando el socio paga.
 */
export const MODOS_INTERES = ['MENSUAL', 'UNICO'] as const;
export type ModoInteres = (typeof MODOS_INTERES)[number];

export const ETIQUETA_MODO_INTERES: Record<ModoInteres, string> = {
  MENSUAL: 'Todos los meses',
  UNICO: 'Una sola vez',
};

export interface ConfiguracionInteres {
  activo: boolean;
  /** Si el recargo se acumula mes a mes o se aplica una única vez. */
  modo: ModoInteres;
  /** Día del mes en que se aplica el recargo. En un mes más corto cae en el último día. */
  diaAplicacion: number;
  /** Porcentaje sobre el importe de la cuota, con hasta dos decimales. */
  porcentaje: number;
  actualizadoEn: string;
}

export const configuracionInteresSchema = z.object({
  activo: z.boolean().default(false),
  modo: z.enum(MODOS_INTERES, { errorMap: () => ({ message: 'Elegí cómo se aplica' }) }).default('MENSUAL'),
  diaAplicacion: z.coerce
    .number({ invalid_type_error: 'Ingresá el día' })
    .int('El día tiene que ser un número entero')
    .min(1, 'El día va del 1 al 31')
    .max(31, 'El día va del 1 al 31'),
  porcentaje: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(',', '.') : v),
    z.coerce
      .number({ invalid_type_error: 'Ingresá el porcentaje' })
      .min(0, 'El porcentaje no puede ser negativo')
      .max(100, 'El porcentaje no puede pasar de 100')
      // Dos decimales: 1,5 % sí, 1,555 % no.
      .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
        message: 'Como mucho dos decimales',
      }),
  ),
});
export type ConfiguracionInteresInput = z.input<typeof configuracionInteresSchema>;
export type ConfiguracionInteresGuardar = z.output<typeof configuracionInteresSchema>;

/** El día de aplicación dentro de un mes 'AAAA-MM', recortado al último día si no existe. */
function diaDe(mes: string, diaAplicacion: number): string {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const dia = Math.min(diaAplicacion, diasDelMes(anio, numeroMes));
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

/**
 * Cuántas veces se aplicó el recargo a una cuota que venció el `vencimiento` y sigue
 * impaga: una por cada día de aplicación que pasó después del vencimiento, hasta hoy.
 * Una cuota que todavía no venció, o que venció pero no llegó al primer día de
 * aplicación, no tiene recargo.
 */
export function vecesAplicado(vencimiento: string, hasta: string, diaAplicacion: number): number {
  if (vencimiento >= hasta) return 0;

  let veces = 0;
  // Se recorren los meses desde el del vencimiento hasta el de hoy, ambos incluidos: el
  // día de aplicación puede caer antes del vencimiento en el primero y después de hoy
  // en el último, y esos dos casos los descarta la comparación.
  const ultimo = hasta.slice(0, 7);
  for (let mes = vencimiento.slice(0, 7); mes <= ultimo; mes = sumarMeses(mes, 1)) {
    const dia = diaDe(mes, diaAplicacion);
    if (dia > vencimiento && dia <= hasta) veces++;
  }
  return veces;
}

/**
 * Interés acumulado de una cuota impaga, en centavos. Se calcula siempre sobre el importe
 * original: dos meses de mora al 5 % son 10 %, no 10,25 %. En modo único no pasa del 5 %.
 *
 * Alcanza a la cuota social y a las de parcela. Las de un plan de pago quedan afuera: su
 * deuda ya se refinanció una vez y el plan tiene sus propias reglas de incumplimiento.
 */
export function interesDeCuota(
  cuota: { importe: number; vencimiento: string; estado: string; origen: string },
  config: Pick<ConfiguracionInteres, 'activo' | 'modo' | 'porcentaje' | 'diaAplicacion'> | null,
  hoy: string,
): number {
  if (!config?.activo || config.porcentaje <= 0) return 0;
  if (cuota.estado !== 'PENDIENTE' || cuota.origen === 'PLAN') return 0;

  const veces = vecesQueCorresponde(cuota.vencimiento, hoy, config);
  return veces === 0 ? 0 : Math.round((cuota.importe * config.porcentaje * veces) / 100);
}

/** Las veces que se aplicó el recargo según el modo: en el único, como mucho una. */
export function vecesQueCorresponde(
  vencimiento: string,
  hasta: string,
  config: Pick<ConfiguracionInteres, 'modo' | 'diaAplicacion'>,
): number {
  const veces = vecesAplicado(vencimiento, hasta, config.diaAplicacion);
  return config.modo === 'UNICO' ? Math.min(veces, 1) : veces;
}
