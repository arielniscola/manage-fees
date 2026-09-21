import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';
import { mesSchema } from './cuotas';
import type { Periodicidad } from './periodos';
import type { ParcelaUbicada, SocioResumen } from './parcelas';

export const MEDIOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'OTRO'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

/** 123 → '0000123'. El recibo es interno, con numeración correlativa propia. */
export const numeroRecibo = (numero: number): string => String(numero).padStart(7, '0');

// ---------------------------------------------------------------- Registrar un cobro

export const cobroCrearSchema = z
  .object({
    socioId: z.coerce.number({ invalid_type_error: 'Elegí un socio' }).int().positive('Elegí un socio'),
    fecha: fechaSchema.default(hoy),
    medio: z.enum(MEDIOS_PAGO, { required_error: 'Elegí el medio de pago' }),
    /** Las cuotas se pagan completas: no se aceptan pagos parciales. */
    cuotaIds: z
      .array(z.coerce.number().int().positive())
      .max(120, 'Son demasiadas cuotas para un solo cobro')
      .default([]),
    /**
     * Último mes que el socio quiere dejar pago por adelantado, 'AAAA-MM'. El servidor
     * calcula qué cuotas futuras faltan hasta ahí, las crea y las cobra en este mismo
     * cobro: no se mandan sus importes desde el navegador.
     */
    adelantarHasta: mesSchema.nullish(),
    /**
     * Renglones del adelanto que quedan afuera, por su clave (ver `claveAdelanto`): sirve
     * para no cobrar, por ejemplo, la cuota social de un mes. Las que se saltean se van a
     * generar como siempre cuando llegue su período.
     */
    adelantarExcepto: z.array(z.string().max(60)).max(400).default([]),
    observaciones: textoOpcional(300),
  })
  // Un cobro sin cuotas tildadas vale si es un adelanto puro, pero vacío del todo no.
  .superRefine((datos, ctx) => {
    if (datos.cuotaIds.length === 0 && !datos.adelantarHasta) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuotaIds'], message: 'Elegí al menos una cuota' });
    }
  });
export type CobroCrearInput = z.input<typeof cobroCrearSchema>;
export type CobroCrear = z.output<typeof cobroCrearSchema>;

export const cobroAnularSchema = z.object({
  motivo: z
    .string({ required_error: 'Contá por qué se anula' })
    .trim()
    .min(3, 'Contá por qué se anula')
    .max(200, 'Máximo 200 caracteres'),
});
export type CobroAnularInput = z.input<typeof cobroAnularSchema>;
export type CobroAnular = z.output<typeof cobroAnularSchema>;

// ---------------------------------------------------------------- Listados

export const cobroListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  /** Cobros que cancelaron alguna cuota de esta parcela. */
  parcelaId: z.coerce.number().int().positive().optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  medio: z.enum(MEDIOS_PAGO).optional(),
  estado: z.enum(['vigentes', 'anulados', 'todos']).default('vigentes'),
  /** Loteo activo del sidebar. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type CobroListarInput = z.input<typeof cobroListarSchema>;
export type CobroListar = z.output<typeof cobroListarSchema>;

export interface CuotaCobrada {
  cuotaId: number;
  periodo: string;
  periodicidad: Periodicidad;
  /** 'septiembre 2026', ya armada con la periodicidad de su tarifa. */
  etiqueta: string;
  /** Null si la cuota es de un plan de pago: esas no cuelgan de una parcela. */
  parcela: ParcelaUbicada | null;
  vencimiento: string;
  importe: number;
  /** Se creó y se cobró en este mismo cobro, por adelantado. */
  adelantada: boolean;
}

export interface CobroListItem {
  id: number;
  fecha: string;
  medio: MedioPago;
  total: number;
  observaciones: string | null;
  socio: SocioResumen;
  /** Número del recibo emitido por este cobro. */
  numeroRecibo: number;
  cantidadCuotas: number;
  anulado: boolean;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  registradoPor: string;
}

export interface CobroDetalle extends CobroListItem {
  cuotas: CuotaCobrada[];
  anuladoPor: string | null;
}

/** Totales del listado con los filtros aplicados, para la cabecera. */
export interface ResumenCobros {
  cobros: number;
  total: number;
}

export interface CobrosPaginados {
  items: CobroListItem[];
  total: number;
  page: number;
  pageSize: number;
  resumen: ResumenCobros;
}

// ---------------------------------------------------------------- Recibo

/**
 * Copia congelada de los datos al momento de emitir el recibo. Se guarda en la base para
 * que reimprimirlo dé exactamente el mismo comprobante, aunque después cambien el nombre
 * del socio, el valor de la cuota o el nombre del club.
 */
export interface DatosRecibo {
  numero: number;
  /** Fecha y hora de emisión, ISO completo. */
  emitidoEn: string;
  /** Fecha del cobro, 'AAAA-MM-DD'. */
  fecha: string;
  club: string;
  socio: {
    numero: number;
    nombre: string;
    apellido: string;
    dni: string;
    direccion: string | null;
  };
  medio: MedioPago;
  observaciones: string | null;
  detalles: {
    concepto: string;
    parcela: string;
    vencimiento: string;
    /** Lo cobrado por esa cuota: su importe más el interés por mora que tenía ese día. */
    importe: number;
    /** Cuánto de ese importe fue interés. Los recibos viejos no lo traen. */
    interes?: number;
    /** Lo que se descontó por pagarla adelantada, ya restado del importe. */
    descuento?: number;
  }[];
  total: number;
  registradoPor: string;
}
