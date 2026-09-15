import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';

export const parcelaCrearSchema = z.object({
  codigo: z
    .string({ required_error: 'Ingresá el código' })
    .trim()
    .min(1, 'Ingresá el código')
    .max(30, 'Máximo 30 caracteres')
    .transform((s) => s.toUpperCase()),
  sector: textoOpcional(60),
  descripcion: textoOpcional(200),
});
export type ParcelaCrearInput = z.input<typeof parcelaCrearSchema>;
export type ParcelaCrear = z.output<typeof parcelaCrearSchema>;

export const parcelaActualizarSchema = parcelaCrearSchema.partial();
export type ParcelaActualizarInput = z.input<typeof parcelaActualizarSchema>;
export type ParcelaActualizar = z.output<typeof parcelaActualizarSchema>;

export const ESTADOS_PARCELA = ['libre', 'asignada'] as const;
export type EstadoParcela = (typeof ESTADOS_PARCELA)[number];

export const parcelaListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  estado: z.enum(['libre', 'asignada', 'todas']).default('todas'),
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
  sector: string | null;
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
}

export interface ParcelaDetalle extends ParcelaListItem {
  asignaciones: AsignacionDeParcela[];
}

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
