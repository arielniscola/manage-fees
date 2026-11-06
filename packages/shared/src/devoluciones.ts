import { z } from 'zod';
import { fechaSchema, hoy, ordenSchema, paginacionSchema } from './common';
import { MEDIOS_PAGO, type DatosRecibo, type MedioPago } from './cobros';
import type { SocioResumen } from './parcelas';

/**
 * Qué pasa con las cuotas del cobro devuelto. Se elige una vez para todo el cobro: o el
 * socio las vuelve a deber, o quedan anuladas y ya no se cobran.
 */
export const DESTINOS_CUOTAS_DEVOLUCION = ['PENDIENTE', 'ANULADA'] as const;
export type DestinoCuotasDevolucion = (typeof DESTINOS_CUOTAS_DEVOLUCION)[number];

export const ETIQUETA_DESTINO_CUOTAS: Record<DestinoCuotasDevolucion, string> = {
  PENDIENTE: 'Vuelven a pendiente',
  ANULADA: 'Quedan anuladas',
};

/** 123 → '0000123'. El comprobante de devolución tiene su propia numeración, aparte de los recibos. */
export const numeroDevolucion = (numero: number): string => String(numero).padStart(7, '0');

// ---------------------------------------------------------------- Registrar y anular

export const devolucionCrearSchema = z.object({
  /** Día en que el dinero salió: la devolución resta en la recaudación de esa fecha. */
  fecha: fechaSchema.default(hoy),
  medio: z.enum(MEDIOS_PAGO, { required_error: 'Elegí el medio de la devolución' }),
  motivoId: z.coerce
    .number({ required_error: 'Elegí el motivo', invalid_type_error: 'Elegí el motivo' })
    .int()
    .positive('Elegí el motivo'),
  /** Aclaración opcional, que se suma al nombre del motivo. */
  detalle: z
    .string()
    .trim()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .transform((v) => v || undefined),
  destinoCuotas: z.enum(DESTINOS_CUOTAS_DEVOLUCION, { required_error: 'Elegí qué pasa con las cuotas' }),
});
export type DevolucionCrearInput = z.input<typeof devolucionCrearSchema>;
export type DevolucionCrear = z.output<typeof devolucionCrearSchema>;

export const devolucionAnularSchema = z.object({
  motivo: z
    .string({ required_error: 'Contá por qué se anula' })
    .trim()
    .min(3, 'Contá por qué se anula')
    .max(200, 'Máximo 200 caracteres'),
});
export type DevolucionAnularInput = z.input<typeof devolucionAnularSchema>;
export type DevolucionAnular = z.output<typeof devolucionAnularSchema>;

// ---------------------------------------------------------------- Motivos

export const motivoDevolucionSchema = z.object({
  nombre: z
    .string({ required_error: 'Escribí el motivo' })
    .trim()
    .min(3, 'Mínimo 3 caracteres')
    .max(80, 'Máximo 80 caracteres'),
});
export type MotivoDevolucionInput = z.input<typeof motivoDevolucionSchema>;
export type MotivoDevolucionDatos = z.output<typeof motivoDevolucionSchema>;

export const motivoDevolucionActualizarSchema = motivoDevolucionSchema.partial().extend({ activo: z.boolean().optional() });
export type MotivoDevolucionActualizarInput = z.input<typeof motivoDevolucionActualizarSchema>;
export type MotivoDevolucionActualizar = z.output<typeof motivoDevolucionActualizarSchema>;

export interface MotivoDevolucion {
  id: number;
  nombre: string;
  activo: boolean;
  /** Devoluciones que lo usan, anuladas incluidas. */
  usos: number;
}

/** Lo que queda escrito en la devolución: el motivo y, si hay, su aclaración. */
export const textoMotivoDevolucion = (nombre: string, detalle?: string): string => (detalle ? `${nombre}: ${detalle}` : nombre);

// ---------------------------------------------------------------- Listados

export const ORDEN_DEVOLUCIONES = ['numero', 'fecha', 'socio', 'importe'] as const;
export type OrdenDevoluciones = (typeof ORDEN_DEVOLUCIONES)[number];

export const devolucionListarSchema = paginacionSchema.extend({
  ...ordenSchema(ORDEN_DEVOLUCIONES),
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  medio: z.enum(MEDIOS_PAGO).optional(),
  estado: z.enum(['vigentes', 'anuladas', 'todas']).default('vigentes'),
  /** Loteo activo del sidebar: el mismo criterio que el cobro devuelto. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type DevolucionListarInput = z.input<typeof devolucionListarSchema>;
export type DevolucionListar = z.output<typeof devolucionListarSchema>;

/** Lo que el cobro muestra de su devolución vigente. */
export interface DevolucionResumen {
  id: number;
  numero: number;
  fecha: string;
}

export interface DevolucionListItem {
  id: number;
  numero: number;
  fecha: string;
  medio: MedioPago;
  importe: number;
  motivo: string;
  destinoCuotas: DestinoCuotasDevolucion;
  socio: SocioResumen & { dni: string };
  cobro: { id: number; numeroRecibo: number; fecha: string };
  cantidadCuotas: number;
  anulada: boolean;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  registradoPor: string;
}

export interface DevolucionDetalle extends DevolucionListItem {
  anuladaPor: string | null;
}

export interface DevolucionesPaginadas {
  items: DevolucionListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Suma de lo filtrado, sin contar las anuladas. */
  resumen: { devoluciones: number; total: number };
}

// ---------------------------------------------------------------- Comprobante

/**
 * Copia congelada al emitir el comprobante, como la del recibo: reimprimirlo da siempre
 * el mismo papel. Los renglones son los del recibo devuelto.
 */
export interface DatosDevolucion {
  numero: number;
  /** Fecha y hora de emisión, ISO completo. */
  emitidoEn: string;
  /** Fecha de la devolución, 'AAAA-MM-DD'. */
  fecha: string;
  club: string;
  socio: DatosRecibo['socio'];
  medio: MedioPago;
  motivo: string;
  destinoCuotas: DestinoCuotasDevolucion;
  recibo: { numero: number; fecha: string };
  detalles: DatosRecibo['detalles'];
  total: number;
  registradoPor: string;
}
