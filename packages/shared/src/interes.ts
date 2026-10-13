import { z } from 'zod';

/**
 * Interés por mora. Es un concepto más a la hora de cobrar: no se genera solo ni engrosa la
 * deuda que se muestra. Cuando se cobra —o se refinancia— una cuota vencida, se propone
 * sumarle el porcentaje configurado sobre su importe, y quien cobra decide si lo deja, lo
 * cambia o lo quita. Lo que finalmente se cobra queda escrito en el cobro y en el recibo.
 */
export interface ConfiguracionInteres {
  activo: boolean;
  /** Porcentaje sobre el importe de la cuota, con hasta dos decimales. */
  porcentaje: number;
  actualizadoEn: string;
}

export const configuracionInteresSchema = z.object({
  activo: z.boolean().default(false),
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

/**
 * Si a una cuota se le puede sumar mora: tiene que seguir impaga y estar vencida, es decir,
 * haber pasado su día de vencimiento.
 *
 * Alcanza solo a las cuotas de parcela. La cuota social no lleva mora: es un aporte fijo
 * del socio y el club no lo recarga. Las de un plan de pago también quedan afuera: su deuda
 * ya se refinanció una vez y el plan tiene sus propias reglas de incumplimiento. El anticipo
 * de entrada tampoco: es un pago único por la asignación, no una cuota periódica.
 */
export function admiteMora(cuota: { vencimiento: string; estado: string; origen: string }, hoy: string): boolean {
  return cuota.estado === 'PENDIENTE' && cuota.origen === 'PARCELA' && cuota.vencimiento < hoy;
}

/**
 * La mora que se propone al cobrar una cuota, en centavos: el porcentaje configurado sobre
 * su importe, una sola vez, por más tiempo que lleve vencida. 0 si no le corresponde.
 */
export function moraSugerida(
  cuota: { importe: number; vencimiento: string; estado: string; origen: string },
  config: Pick<ConfiguracionInteres, 'activo' | 'porcentaje'> | null,
  hoy: string,
): number {
  if (!config?.activo || config.porcentaje <= 0) return 0;
  if (!admiteMora(cuota, hoy)) return 0;
  return Math.round((cuota.importe * config.porcentaje) / 100);
}

/**
 * Las moras que se suman a un cobro o a un plan: de qué cuota y por cuánto, en centavos.
 * Solo viajan las que quien cobra decidió dejar; una cuota que no figura no lleva mora.
 */
export const morasSchema = z
  .array(
    z.object({
      cuotaId: z.coerce.number().int().positive(),
      importe: z.coerce
        .number({ invalid_type_error: 'Ingresá el importe de la mora' })
        .int('Ingresá el importe de la mora')
        .positive('La mora debe ser mayor a 0')
        .max(99_999_999_99, 'El importe es demasiado grande'),
    }),
  )
  .max(200, 'Son demasiadas moras')
  .refine((moras) => new Set(moras.map((m) => m.cuotaId)).size === moras.length, 'Hay una cuota con la mora repetida')
  .default([]);
export type MoraDeCuota = z.output<typeof morasSchema>[number];
