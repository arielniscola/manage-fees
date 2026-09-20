import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';
import { importeOpcionalSchema } from './dinero';
import { TOLERANCIA_VENCIDAS } from './planes';
import type { CuotaListItem, EstadoCuenta } from './cuotas';
import { mesDe, sumarMeses } from './periodos';

/**
 * El predio se organiza en tres niveles: Loteo > Sector > Parcela.
 * El loteo es el fraccionamiento («Lavalle»), el sector la manzana dentro de él («7»),
 * y la parcela el lote. Los dos niveles de arriba son opcionales, para poder cargar
 * parcelas antes de tener el mapa completo.
 */
export interface LoteoResumen {
  id: number;
  nombre: string;
}

export interface Loteo extends LoteoResumen {
  descripcion: string | null;
  direccion: string | null;
  sectores: number;
  parcelas: number;
  /** Un loteo con sectores no se puede eliminar. */
  puedeEliminar: boolean;
}

export const loteoCrearSchema = z.object({
  nombre: z
    .string({ required_error: 'Ingresá el nombre' })
    .trim()
    .min(1, 'Ingresá el nombre')
    .max(60, 'Máximo 60 caracteres'),
  descripcion: textoOpcional(200),
  direccion: textoOpcional(160),
});
export type LoteoCrearInput = z.input<typeof loteoCrearSchema>;
export type LoteoCrear = z.output<typeof loteoCrearSchema>;

export const loteoActualizarSchema = loteoCrearSchema.partial();
export type LoteoActualizarInput = z.input<typeof loteoActualizarSchema>;
export type LoteoActualizar = z.output<typeof loteoActualizarSchema>;

/** Manzana dentro de un loteo: «7», «A-01». */
export interface SectorResumen {
  id: number;
  nombre: string;
  loteo: LoteoResumen | null;
}

export interface Sector extends SectorResumen {
  descripcion: string | null;
  /** Cuántas parcelas tiene asignadas. */
  parcelas: number;
  /** Un sector con parcelas no se puede eliminar. */
  puedeEliminar: boolean;
}

/** Referencia opcional a una entidad: el select manda '' cuando no se eligió ninguna. */
const referenciaOpcional = (mensaje: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: mensaje }).int().positive(mensaje).nullable(),
  );

export const sectorCrearSchema = z.object({
  nombre: z
    .string({ required_error: 'Ingresá el nombre' })
    .trim()
    .min(1, 'Ingresá el nombre')
    .max(60, 'Máximo 60 caracteres'),
  /** Null mientras el sector no esté asignado a ningún loteo. */
  loteoId: referenciaOpcional('Elegí un loteo'),
  descripcion: textoOpcional(200),
});
export type SectorCrearInput = z.input<typeof sectorCrearSchema>;
export type SectorCrear = z.output<typeof sectorCrearSchema>;

export const sectorListarSchema = z.object({
  /** Loteo activo del sidebar: deja solo los sectores de ese loteo. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type SectorListarInput = z.input<typeof sectorListarSchema>;
export type SectorListar = z.output<typeof sectorListarSchema>;

export const sectorActualizarSchema = sectorCrearSchema.partial();
export type SectorActualizarInput = z.input<typeof sectorActualizarSchema>;
export type SectorActualizar = z.output<typeof sectorActualizarSchema>;

export const parcelaCrearSchema = z.object({
  codigo: z
    .string({ required_error: 'Ingresá el código' })
    .trim()
    .min(1, 'Ingresá el código')
    .max(30, 'Máximo 30 caracteres')
    .transform((s) => s.toUpperCase()),
  /** Null si la parcela todavía no está en ningún sector. */
  sectorId: referenciaOpcional('Elegí un sector'),
  /** Superficie en metros cuadrados, con hasta dos decimales. */
  superficieM2: z.preprocess(
    (v) => (v === '' || v === undefined ? null : typeof v === 'string' ? v.replace(',', '.') : v),
    z.coerce
      .number({ invalid_type_error: 'Ingresá la superficie en metros cuadrados' })
      .positive('La superficie debe ser mayor a 0')
      .max(9_999_999, 'La superficie es demasiado grande')
      .nullable(),
  ),
  descripcion: textoOpcional(200),
});
export type ParcelaCrearInput = z.input<typeof parcelaCrearSchema>;
export type ParcelaCrear = z.output<typeof parcelaCrearSchema>;

export const parcelaActualizarSchema = parcelaCrearSchema.partial();
export type ParcelaActualizarInput = z.input<typeof parcelaActualizarSchema>;
export type ParcelaActualizar = z.output<typeof parcelaActualizarSchema>;

/** Lo mínimo para nombrar una parcela sin ambigüedad. */
export interface ParcelaUbicada {
  id: number;
  codigo: string;
  etiqueta: string;
  /** Nombre del sector (la manzana), o null si la parcela no tiene. */
  manzana: string | null;
}

/**
 * El número de la parcela dentro de su manzana: el código sin la manzana adelante.
 * «7-12» en la manzana «7» es la 12; un código que no sigue esa forma queda entero.
 */
export function numeroDeParcela(parcela: { codigo: string; manzana: string | null }): string {
  const prefijo = parcela.manzana ? `${parcela.manzana}-` : null;
  return prefijo && parcela.codigo.startsWith(prefijo) ? parcela.codigo.slice(prefijo.length) : parcela.codigo;
}

/**
 * Cómo se escribe una parcela donde el loteo no está implícito: recibos, avisos, Excel,
 * los chips de la ficha del socio. El código es único solo dentro de su sector, así que
 * «7-1» a secas puede ser de dos loteos; con el loteo delante deja de serlo.
 * Una parcela sin loteo se queda con su código, que es todo lo que hay.
 */
export function etiquetaParcela(parcela: { codigo: string; sector: SectorResumen | null }): string {
  const loteo = parcela.sector?.loteo?.nombre;
  return loteo ? `${loteo} · ${parcela.codigo}` : parcela.codigo;
}

export const ESTADOS_PARCELA = ['libre', 'asignada'] as const;
export type EstadoParcela = (typeof ESTADOS_PARCELA)[number];

export const parcelaListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  estado: z.enum(['libre', 'asignada', 'todas']).default('todas'),
  sectorId: z.coerce.number().int().positive().optional(),
  loteoId: z.coerce.number().int().positive().optional(),
});
export type ParcelaListarInput = z.input<typeof parcelaListarSchema>;
export type ParcelaListar = z.output<typeof parcelaListarSchema>;

export interface SocioResumen {
  id: number;
  numero: number;
  nombre: string;
  apellido: string;
}

export interface ParcelaListItem {
  id: number;
  codigo: string;
  /** «Lavalle · 7-1»: el código con su loteo adelante. Ver `etiquetaParcela`. */
  etiqueta: string;
  sector: SectorResumen | null;
  superficieM2: number | null;
  descripcion: string | null;
  estado: EstadoParcela;
  titular: (SocioResumen & { desde: string }) | null;
  /** Una parcela que alguna vez estuvo asignada no se puede eliminar. */
  puedeEliminar: boolean;
}

export interface AsignacionDeParcela {
  id: number;
  desde: string;
  hasta: string | null;
  socio: SocioResumen;
  /** Si la titularidad terminó por una transferencia, a quién pasó. */
  transferidaA: SocioResumen | null;
  /** Si la titularidad empezó por una transferencia, de quién vino. */
  recibidaDe: SocioResumen | null;
}

/** Cambio de titular de una parcela, con quién la registró y por qué. */
export interface Transferencia {
  id: number;
  fecha: string;
  parcela: ParcelaUbicada;
  de: SocioResumen;
  a: SocioResumen;
  motivo: string | null;
  registradaPor: string;
  registradaEn: string;
}

export interface ParcelaDetalle extends ParcelaListItem {
  asignaciones: AsignacionDeParcela[];
  transferencias: Transferencia[];
  /**
   * Deuda de las cuotas de esta parcela, con su interés por mora. Es la deuda de la
   * parcela, no la del titular: un socio con tres parcelas debe por cada una.
   */
  estadoCuenta: EstadoCuenta;
  /** Total cobrado histórico por cuotas de esta parcela, sin contar los cobros anulados. */
  cobrado: number;
}

/**
 * Lo que la parcela debe al día de la transferencia: las cuotas impagas que quedan con el
 * titular saliente, porque son de períodos que ya habían empezado. Las de períodos futuros
 * viajan con la parcela y no son deuda de nadie todavía.
 */
export interface DeudaDeTransferencia {
  socio: SocioResumen;
  cuotas: CuotaListItem[];
  /** Centavos, con el interés por mora del día. */
  total: number;
  /** Cuántas de esas cuotas ya están vencidas. */
  vencidas: number;
}

export interface TransferenciaRealizada extends Transferencia {
  /**
   * Cuotas impagas de períodos que todavía no habían empezado y pasaron al nuevo titular.
   * Las ya vencidas quedan con quien era titular cuando se generaron.
   */
  cuotasMovidas: number;
  /** Número del plan que se firmó con la deuda de la parcela, si hacía falta. */
  planFirmado: number | null;
}

/**
 * Primer período que le corresponde al socio que recibe una parcela. Sigue la misma regla
 * que la generación de cuotas: el período es de quien era titular cuando empezó. Si la
 * transferencia cae el día 1, ese mismo período ya es del que entra.
 */
export function primerPeriodoDelNuevoTitular(fecha: string): string {
  const mes = mesDe(fecha);
  return fecha.endsWith('-01') ? mes : sumarMeses(mes, 1);
}

/**
 * Condiciones del plan con el que se refinancia la deuda de la parcela al transferirla.
 * No lleva socio ni cuotas: son las que quedan con el titular saliente, que las calcula
 * el servidor con la misma fecha de la transferencia.
 */
export const planDeTransferenciaSchema = z.object({
  cantidadCuotas: z.coerce
    .number({ invalid_type_error: 'Indicá en cuántas cuotas' })
    .int('Indicá un número entero de cuotas')
    .min(1, 'El plan tiene que tener al menos una cuota')
    .max(60, 'Máximo 60 cuotas'),
  anticipo: importeOpcionalSchema,
  primerVencimiento: fechaSchema,
  toleranciaVencidas: z.coerce.number().int().min(1, 'Tiene que ser al menos 1').max(12, 'Máximo 12').default(TOLERANCIA_VENCIDAS),
  observaciones: textoOpcional(300),
});
export type PlanDeTransferenciaInput = z.input<typeof planDeTransferenciaSchema>;
export type PlanDeTransferencia = z.output<typeof planDeTransferenciaSchema>;

export const transferenciaCrearSchema = z
  .object({
    /** El socio que recibe la parcela. Suele ser un suplente, pero puede ser cualquiera. */
    aSocioId: z.coerce.number({ invalid_type_error: 'Elegí el socio que la recibe' }).int().positive('Elegí el socio que la recibe'),
    fecha: fechaSchema.default(hoy),
    motivo: textoOpcional(200),
    /**
     * Obligatorio cuando la parcela tiene deuda: no se entrega una parcela dejando cuotas
     * impagas sueltas. El plan se firma y la parcela cambia de manos en la misma
     * transacción, así que o pasan las dos cosas o no pasa ninguna.
     */
    plan: planDeTransferenciaSchema.optional(),
  })
  .refine((t) => !t.plan || t.plan.primerVencimiento >= t.fecha, {
    message: 'El primer vencimiento no puede ser anterior a la fecha de la transferencia',
    path: ['plan', 'primerVencimiento'],
  });
export type TransferenciaCrearInput = z.input<typeof transferenciaCrearSchema>;
export type TransferenciaCrear = z.output<typeof transferenciaCrearSchema>;

export const transferenciaListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  parcelaId: z.coerce.number().int().positive().optional(),
});
export type TransferenciaListarInput = z.input<typeof transferenciaListarSchema>;
export type TransferenciaListar = z.output<typeof transferenciaListarSchema>;

export const asignacionCrearSchema = z.object({
  parcelaId: z.coerce.number({ invalid_type_error: 'Elegí una parcela' }).int().positive('Elegí una parcela'),
  desde: fechaSchema.default(hoy),
});
export type AsignacionCrearInput = z.input<typeof asignacionCrearSchema>;
export type AsignacionCrear = z.output<typeof asignacionCrearSchema>;

export const asignacionLiberarSchema = z.object({
  hasta: fechaSchema.default(hoy),
});
export type AsignacionLiberarInput = z.input<typeof asignacionLiberarSchema>;
export type AsignacionLiberar = z.output<typeof asignacionLiberarSchema>;
