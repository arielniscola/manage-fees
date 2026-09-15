import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';

export const dniSchema = z
  .string({ required_error: 'Ingresá el DNI' })
  .transform((s) => s.replace(/[.\s-]/g, ''))
  .pipe(z.string().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos'));

const socioBase = z.object({
  numero: z.coerce
    .number({ invalid_type_error: 'El número debe ser un entero' })
    .int('El número debe ser un entero')
    .positive('El número debe ser mayor a 0')
    .nullish()
    .transform((v) => v ?? null),
  nombre: z.string({ required_error: 'Ingresá el nombre' }).trim().min(1, 'Ingresá el nombre').max(80),
  apellido: z.string({ required_error: 'Ingresá el apellido' }).trim().min(1, 'Ingresá el apellido').max(80),
  dni: dniSchema,
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .pipe(z.string().email('Ingresá un email válido').nullable()),
  telefono: textoOpcional(30),
  direccion: textoOpcional(160),
  observaciones: textoOpcional(500),
  fechaAlta: fechaSchema.default(hoy),
});

/** Alta de socio. Si no se indica número, se asigna el siguiente disponible. */
export const socioCrearSchema = socioBase;
export type SocioCrearInput = z.input<typeof socioCrearSchema>;
export type SocioCrear = z.output<typeof socioCrearSchema>;

export const socioActualizarSchema = socioBase.partial();
export type SocioActualizarInput = z.input<typeof socioActualizarSchema>;
export type SocioActualizar = z.output<typeof socioActualizarSchema>;

export const socioBajaSchema = z.object({
  fechaBaja: fechaSchema.default(hoy),
  motivo: textoOpcional(200),
});
export type SocioBajaInput = z.input<typeof socioBajaSchema>;
export type SocioBaja = z.output<typeof socioBajaSchema>;

export const ESTADOS_SOCIO = ['activo', 'baja'] as const;
export type EstadoSocio = (typeof ESTADOS_SOCIO)[number];

export const socioListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  estado: z.enum(['activo', 'baja', 'todos']).default('activo'),
});
export type SocioListarInput = z.input<typeof socioListarSchema>;
export type SocioListar = z.output<typeof socioListarSchema>;

export interface ParcelaResumen {
  id: number;
  codigo: string;
}

export interface SocioListItem {
  id: number;
  numero: number;
  nombre: string;
  apellido: string;
  dni: string;
  email: string | null;
  telefono: string | null;
  fechaAlta: string;
  fechaBaja: string | null;
  estado: EstadoSocio;
  parcelas: ParcelaResumen[];
}

export interface AsignacionDeSocio {
  id: number;
  desde: string;
  hasta: string | null;
  parcela: ParcelaResumen & { sector: string | null };
}

export interface SocioDetalle extends SocioListItem {
  direccion: string | null;
  observaciones: string | null;
  motivoBaja: string | null;
  asignaciones: AsignacionDeSocio[];
}
