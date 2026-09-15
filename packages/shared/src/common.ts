import { z } from 'zod';

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina, en formato YYYY-MM-DD. */
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

export const fechaSchema = z
  .string({ required_error: 'Ingresá una fecha' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'La fecha no es válida');

/** Texto opcional: un string vacío o solo espacios se guarda como null. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

export const paginacionSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Campo del formulario al que corresponde el error, si aplica. */
  field?: string;
  /** Código de error de negocio, por ejemplo DEBE_CAMBIAR_PASSWORD. */
  code?: string;
  errors?: { path: string; message: string }[];
}
