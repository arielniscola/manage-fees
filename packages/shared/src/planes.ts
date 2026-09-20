import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';
import { importeOpcionalSchema, repartir } from './dinero';
import { mesDe, sumarMeses, vencimientoDe } from './periodos';
import type { EstadoCuotaVisible } from './cuotas';
import type { SocioResumen } from './parcelas';

/**
 * Plan de pago para un socio moroso: se eligen cuotas impagas, quedan refinanciadas y el
 * plan genera cuotas nuevas en su lugar. Por ahora sin interés, según el supuesto del plan.
 */

export const ESTADOS_PLAN = ['vigente', 'cumplido', 'incumplido', 'cancelado'] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

export const ETIQUETA_ESTADO_PLAN: Record<EstadoPlan, string> = {
  vigente: 'Vigente',
  cumplido: 'Cumplido',
  incumplido: 'Incumplido',
  cancelado: 'Cancelado',
};

/** Cuántas cuotas vencidas impagas dan el plan por incumplido, si no se indica otra cosa. */
export const TOLERANCIA_VENCIDAS = 2;

/** 12 → '00012'. Para referirse a un plan por número. */
export const numeroPlan = (numero: number): string => String(numero).padStart(5, '0');

/** El número 0 es el anticipo; de 1 en adelante, las cuotas financiadas. */
export const ANTICIPO = 0;

// ---------------------------------------------------------------- Simulación

export interface CuotaDePlan {
  /** 0 es el anticipo; 1..n las cuotas financiadas. */
  numero: number;
  vencimiento: string;
  importe: number;
}

export interface SimulacionPlan {
  deudaTotal: number;
  anticipo: number;
  /** Lo que queda a financiar después del anticipo. */
  financiado: number;
  cuotas: CuotaDePlan[];
  /** Importe de la cuota típica, para mostrar «4 cuotas de $X». */
  importeCuota: number;
  ultimoVencimiento: string | null;
}

/**
 * Arma las cuotas del plan. La misma función se usa en la web para la simulación y en la
 * API para generarlas, así lo que el socio ve firmado es exactamente lo que se guarda.
 *
 * El anticipo vence el día de la firma y se cobra como una cuota más, para que la plata
 * entre siempre por el mismo circuito de cobros y recibos.
 */
export function simularPlan(opciones: {
  deudaTotal: number;
  anticipo: number;
  cantidadCuotas: number;
  fecha: string;
  primerVencimiento: string;
}): SimulacionPlan {
  const { deudaTotal, anticipo, cantidadCuotas, fecha, primerVencimiento } = opciones;
  const financiado = Math.max(0, deudaTotal - anticipo);
  const cuotas: CuotaDePlan[] = [];

  if (anticipo > 0) cuotas.push({ numero: ANTICIPO, vencimiento: fecha, importe: anticipo });

  const dia = Number(primerVencimiento.slice(8, 10));
  const mesInicial = mesDe(primerVencimiento);
  repartir(financiado, cantidadCuotas).forEach((importe, i) => {
    cuotas.push({ numero: i + 1, vencimiento: vencimientoDe(sumarMeses(mesInicial, i), dia), importe });
  });

  const financiadas = cuotas.filter((c) => c.numero !== ANTICIPO);
  return {
    deudaTotal,
    anticipo,
    financiado,
    cuotas,
    importeCuota: financiadas[0]?.importe ?? 0,
    ultimoVencimiento: financiadas.at(-1)?.vencimiento ?? null,
  };
}

// ---------------------------------------------------------------- Esquemas

export const planCrearSchema = z
  .object({
    socioId: z.coerce.number({ invalid_type_error: 'Elegí un socio' }).int().positive('Elegí un socio'),
    fecha: fechaSchema.default(hoy),
    /** Cuotas impagas que se refinancian. */
    cuotaIds: z
      .array(z.coerce.number().int().positive())
      .min(1, 'Elegí al menos una cuota para refinanciar')
      .max(200, 'Son demasiadas cuotas para un solo plan'),
    cantidadCuotas: z.coerce
      .number({ invalid_type_error: 'Indicá en cuántas cuotas' })
      .int('Indicá un número entero de cuotas')
      .min(1, 'El plan tiene que tener al menos una cuota')
      .max(60, 'Máximo 60 cuotas'),
    anticipo: importeOpcionalSchema,
    primerVencimiento: fechaSchema,
    toleranciaVencidas: z.coerce
      .number()
      .int()
      .min(1, 'Tiene que ser al menos 1')
      .max(12, 'Máximo 12')
      .default(TOLERANCIA_VENCIDAS),
    observaciones: textoOpcional(300),
  })
  .refine((p) => p.primerVencimiento >= p.fecha, {
    message: 'El primer vencimiento no puede ser anterior a la fecha del plan',
    path: ['primerVencimiento'],
  });
export type PlanCrearInput = z.input<typeof planCrearSchema>;
export type PlanCrear = z.output<typeof planCrearSchema>;

export const planCancelarSchema = z.object({
  motivo: z
    .string({ required_error: 'Contá por qué se cancela' })
    .trim()
    .min(3, 'Contá por qué se cancela')
    .max(200, 'Máximo 200 caracteres'),
});
export type PlanCancelarInput = z.input<typeof planCancelarSchema>;
export type PlanCancelar = z.output<typeof planCancelarSchema>;

export const planListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  estado: z.enum([...ESTADOS_PLAN, 'todos']).default('todos'),
  /** Loteo activo del sidebar. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type PlanListarInput = z.input<typeof planListarSchema>;
export type PlanListar = z.output<typeof planListarSchema>;

// ---------------------------------------------------------------- Respuestas

export interface PlanListItem {
  id: number;
  numero: number;
  fecha: string;
  socio: SocioResumen;
  deudaTotal: number;
  anticipo: number;
  financiado: number;
  cantidadCuotas: number;
  toleranciaVencidas: number;
  /** Se calcula a partir de las cuotas: no depende de que corra ningún proceso. */
  estado: EstadoPlan;
  pagadas: number;
  vencidas: number;
  pendientes: number;
  /** Centavos ya cobrados del plan. */
  cobrado: number;
  /** Centavos que faltan cobrar. */
  saldo: number;
  proximoVencimiento: string | null;
  canceladoEn: string | null;
  motivoCancelacion: string | null;
  creadoPor: string;
}

export interface CuotaDelPlan extends CuotaDePlan {
  cuotaId: number;
  estado: EstadoCuotaVisible;
  diasVencida: number;
}

export interface DeudaRefinanciada {
  cuotaId: number;
  etiqueta: string;
  parcela: string | null;
  vencimiento: string;
  importe: number;
}

export interface PlanDetalle extends PlanListItem {
  observaciones: string | null;
  cuotas: CuotaDelPlan[];
  refinanciadas: DeudaRefinanciada[];
}
