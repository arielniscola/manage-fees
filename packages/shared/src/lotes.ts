import { z } from 'zod';

/** Tope por pedido: alcanza para varias páginas de cualquier listado. */
export const MAX_LOTE = 500;

/** Los registros elegidos en un listado para una acción por lotes. Los repetidos se descartan. */
export const loteSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'Elegí al menos uno')
    .max(MAX_LOTE, `Se pueden procesar hasta ${MAX_LOTE} por vez`)
    .transform((ids) => [...new Set(ids)]),
});
export type LoteInput = z.input<typeof loteSchema>;
export type Lote = z.output<typeof loteSchema>;

/** Anular por lotes pide un único motivo, que queda en cada registro. */
export const loteAnularSchema = loteSchema.extend({
  motivo: z
    .string({ required_error: 'Contá por qué se anulan' })
    .trim()
    .min(3, 'Contá por qué se anulan')
    .max(200, 'Máximo 200 caracteres'),
});
export type LoteAnularInput = z.input<typeof loteAnularSchema>;
export type LoteAnular = z.output<typeof loteAnularSchema>;

/**
 * Una acción por lotes procesa lo que puede y saltea el resto: cada registro se valida
 * con las mismas reglas que la acción individual, y si no las cumple queda acá con el motivo.
 */
export interface ResultadoLote {
  procesados: number;
  omitidos: { id: number; motivo: string }[];
}
