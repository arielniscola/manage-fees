import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema } from './common';
import { importeSchema } from './dinero';
import { etiquetaPeriodo, PERIODICIDADES, type Periodicidad } from './periodos';
import { numeroPlan } from './planes';
import type { ParcelaResumen } from './socios';
import type { SectorResumen, SocioResumen } from './parcelas';

/** Mes de calendario 'AAAA-MM'. Las tarifas rigen desde el primero de un mes. */
export const mesSchema = z
  .string({ required_error: 'Elegí desde cuándo rige' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes debe tener el formato AAAA-MM');

/** Mes actual en Argentina, 'AAAA-MM'. */
export const mesActual = (): string => hoy().slice(0, 7);

// ---------------------------------------------------------------- Tarifas

/**
 * Qué cuota valoriza una tarifa. El socio con parcela paga las dos: la social por ser
 * socio, y una por cada parcela, que es el pago por la propiedad del terreno. Cada alcance
 * lleva su propio historial, con su importe, su periodicidad y su día de vencimiento.
 */
export const ALCANCES_TARIFA = ['SOCIO', 'PARCELA'] as const;
export type AlcanceTarifa = (typeof ALCANCES_TARIFA)[number];

export const ETIQUETA_ALCANCE: Record<AlcanceTarifa, string> = {
  SOCIO: 'Cuota social',
  PARCELA: 'Cuota por parcela',
};

export const DESCRIPCION_ALCANCE: Record<AlcanceTarifa, string> = {
  SOCIO: 'Una por socio y período. Solo la generan los socios que tienen alguna parcela; los suplentes no pagan.',
  PARCELA: 'El pago por la propiedad del terreno: una por cada parcela asignada y período.',
};

export const tarifaCrearSchema = z.object({
  alcance: z.enum(ALCANCES_TARIFA, { required_error: 'Elegí qué cuota valoriza' }).default('PARCELA'),
  importe: importeSchema,
  periodicidad: z.enum(PERIODICIDADES, { required_error: 'Elegí la periodicidad' }).default('MENSUAL'),
  diaVencimiento: z.coerce
    .number({ invalid_type_error: 'El día debe ser un número' })
    .int('El día debe ser un número entero')
    .min(1, 'El día debe estar entre 1 y 31')
    .max(31, 'El día debe estar entre 1 y 31')
    .default(10),
  vigenteDesde: mesSchema.default(mesActual),
});
export type TarifaCrearInput = z.input<typeof tarifaCrearSchema>;
export type TarifaCrear = z.output<typeof tarifaCrearSchema>;

export const tarifaActualizarSchema = tarifaCrearSchema.partial();
export type TarifaActualizarInput = z.input<typeof tarifaActualizarSchema>;
export type TarifaActualizar = z.output<typeof tarifaActualizarSchema>;

export interface Tarifa {
  id: number;
  alcance: AlcanceTarifa;
  importe: number;
  periodicidad: Periodicidad;
  diaVencimiento: number;
  /** Mes desde el que rige, 'AAAA-MM'. */
  vigenteDesde: string;
  /** Es la tarifa que se aplica hoy. */
  vigente: boolean;
  /** Todavía no empezó a regir. */
  futura: boolean;
  cuotasGeneradas: number;
  /** Solo se edita o elimina una tarifa que aún no generó cuotas. */
  puedeEditar: boolean;
}

/** Filtro del listado de tarifas: sin alcance vienen las de los dos. */
export const tarifaListarSchema = z.object({
  alcance: z.enum(ALCANCES_TARIFA).optional(),
});
export type TarifaListarInput = z.input<typeof tarifaListarSchema>;
export type TarifaListar = z.output<typeof tarifaListarSchema>;

// ---------------------------------------------------------------- Cuotas

export const ESTADOS_CUOTA = ['PENDIENTE', 'PAGADA', 'ANULADA', 'REFINANCIADA'] as const;
export type EstadoCuota = (typeof ESTADOS_CUOTA)[number];

/**
 * «Vencida» no se guarda: una cuota pendiente cuyo vencimiento ya pasó figura como
 * vencida sin que haga falta que corra ningún proceso.
 */
export const ESTADOS_CUOTA_VISIBLES = ['pendiente', 'vencida', 'pagada', 'anulada', 'refinanciada'] as const;
export type EstadoCuotaVisible = (typeof ESTADOS_CUOTA_VISIBLES)[number];

export const ETIQUETA_ESTADO_CUOTA: Record<EstadoCuotaVisible, string> = {
  pendiente: 'Pendiente',
  vencida: 'Vencida',
  pagada: 'Pagada',
  anulada: 'Anulada',
  refinanciada: 'Refinanciada',
};

export function estadoVisible(estado: EstadoCuota, vencimiento: string, hoyISO = hoy()): EstadoCuotaVisible {
  if (estado === 'PAGADA') return 'pagada';
  if (estado === 'ANULADA') return 'anulada';
  if (estado === 'REFINANCIADA') return 'refinanciada';
  return vencimiento < hoyISO ? 'vencida' : 'pendiente';
}

export const ORIGENES_CUOTA = ['PARCELA', 'SOCIO', 'PLAN'] as const;
export type OrigenCuota = (typeof ORIGENES_CUOTA)[number];


/** Filtro de estado para las cuotas de un socio, que se devuelven sin paginar. */
export const cuotasDeSocioSchema = z.object({
  estado: z.enum([...ESTADOS_CUOTA_VISIBLES, 'impaga', 'todas']).default('todas'),
});
export type CuotasDeSocioInput = z.input<typeof cuotasDeSocioSchema>;
export type CuotasDeSocio = z.output<typeof cuotasDeSocioSchema>;

export const cuotaListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  parcelaId: z.coerce.number().int().positive().optional(),
  periodo: mesSchema.optional(),
  /** `impaga` junta pendientes y vencidas: son las que se pueden cobrar. */
  estado: z.enum([...ESTADOS_CUOTA_VISIBLES, 'impaga', 'todas']).default('todas'),
  /** Sin origen vienen las de parcela, las sociales y las de plan. */
  origen: z.enum(ORIGENES_CUOTA).optional(),
  /** Loteo activo del sidebar. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type CuotaListarInput = z.input<typeof cuotaListarSchema>;
export type CuotaListar = z.output<typeof cuotaListarSchema>;

/** De qué plan de pago salió una cuota con origen PLAN. */
export interface CuotaDeUnPlan {
  id: number;
  numero: number;
  /** 0 es el anticipo; de 1 en adelante, las cuotas financiadas. */
  cuotaNumero: number;
  cantidadCuotas: number;
}

export interface CuotaListItem {
  id: number;
  periodo: string;
  periodicidad: Periodicidad;
  /** El concepto listo para mostrar: 'septiembre 2026' o 'Cuota 2 de 4 del plan 00003'. */
  etiqueta: string;
  importe: number;
  vencimiento: string;
  estado: EstadoCuotaVisible;
  origen: OrigenCuota;
  /** La creó un pago adelantado: no existía hasta que el socio vino a pagarla. */
  adelantada: boolean;
  /** Días transcurridos desde el vencimiento; 0 si todavía no venció. */
  diasVencida: number;
  /**
   * Interés por mora acumulado hasta hoy, en centavos. Se calcula al vuelo con la
   * configuración vigente, así que crece solo mientras la cuota siga impaga. 0 si el
   * interés está apagado o la cuota no devenga.
   */
  interes: number;
  socio: SocioResumen;
  /** Las cuotas de un plan de pago no cuelgan de ninguna parcela. */
  parcela: (ParcelaResumen & { sector: SectorResumen | null }) | null;
  plan: CuotaDeUnPlan | null;
  motivoAnulacion: string | null;
}

export const cuotaAnularSchema = z.object({
  motivo: z
    .string({ required_error: 'Contá por qué se anula' })
    .trim()
    .min(3, 'Contá por qué se anula')
    .max(200, 'Máximo 200 caracteres'),
});
export type CuotaAnularInput = z.input<typeof cuotaAnularSchema>;
export type CuotaAnular = z.output<typeof cuotaAnularSchema>;

/** Concepto legible de una cuota, el mismo en pantalla y en el recibo. */
export function conceptoCuota(datos: {
  origen: OrigenCuota;
  periodo: string;
  periodicidad: Periodicidad;
  plan: CuotaDeUnPlan | null;
}): string {
  const periodo = etiquetaPeriodo(datos.periodo, datos.periodicidad);
  // La cuota social no cuelga de ninguna parcela: si no lo dice el concepto, no lo dice nada.
  if (datos.origen === 'SOCIO') return `Cuota social ${periodo}`;
  if (datos.origen === 'PARCELA' || !datos.plan) return periodo;
  const { numero, cuotaNumero, cantidadCuotas } = datos.plan;
  return cuotaNumero === 0
    ? `Anticipo del plan ${numeroPlan(numero)}`
    : `Cuota ${cuotaNumero} de ${cantidadCuotas} del plan ${numeroPlan(numero)}`;
}

/** Resumen de deuda de un socio, para el listado y la ficha. */
export interface EstadoCuenta {
  /** Cuotas sin pagar, incluidas las vencidas. */
  pendientes: number;
  vencidas: number;
  /** Total adeudado en centavos, interés por mora incluido, esté vencido o no. */
  deuda: number;
  /** La parte de la deuda que ya venció, también con su interés. */
  deudaVencida: number;
  /** Cuánto de esa deuda es interés por mora. Va aparte para poder mostrarlo. */
  interes: number;
}

// ---------------------------------------------------------------- Generación

export const generarCuotasSchema = z.object({
  /** Se generan los períodos que hayan empezado hasta esta fecha. */
  hasta: fechaSchema.default(hoy),
  /** Solo calcula y devuelve la vista previa, sin escribir nada. */
  simular: z.coerce.boolean().default(false),
});
export type GenerarCuotasInput = z.input<typeof generarCuotasSchema>;
export type GenerarCuotas = z.output<typeof generarCuotasSchema>;

export interface PeriodoGenerado {
  periodo: string;
  etiqueta: string;
  vencimiento: string;
  cantidad: number;
  importe: number;
}

export interface ResultadoGeneracion {
  hasta: string;
  simulado: boolean;
  /** Períodos con cuotas nuevas, del más viejo al más nuevo. */
  periodos: PeriodoGenerado[];
  cuotas: number;
  importe: number;
  socios: number;
  /** Cuotas que ya existían y por eso no se volvieron a generar. */
  yaExistian: number;
  /** No hay ninguna tarifa configurada: no se puede generar nada todavía. */
  sinTarifa: boolean;
}
