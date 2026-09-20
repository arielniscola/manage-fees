import { z } from 'zod';
import { fechaSchema, hoy, paginacionSchema, textoOpcional } from './common';
import type { EstadoCuenta } from './cuotas';
import type { SectorResumen } from './parcelas';

/**
 * Un socio titular tiene (o tuvo) parcelas a su nombre. Un suplente está en lista de
 * espera: no tiene parcela, y es a quien se le puede transferir una cuando se libera.
 * Recibir una parcela lo convierte en titular automáticamente.
 */
export const TIPOS_SOCIO = ['TITULAR', 'SUPLENTE'] as const;
export type TipoSocio = (typeof TIPOS_SOCIO)[number];

export const ETIQUETA_TIPO_SOCIO: Record<TipoSocio, string> = {
  TITULAR: 'Titular',
  SUPLENTE: 'Suplente',
};

export const ESTADOS_CIVILES = ['SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'SEPARADO', 'CONCUBINATO'] as const;
export type EstadoCivil = (typeof ESTADOS_CIVILES)[number];

export const ETIQUETA_ESTADO_CIVIL: Record<EstadoCivil, string> = {
  SOLTERO: 'Soltero/a',
  CASADO: 'Casado/a',
  DIVORCIADO: 'Divorciado/a',
  VIUDO: 'Viudo/a',
  SEPARADO: 'Separado/a',
  CONCUBINATO: 'En concubinato',
};

/**
 * Verifica el dígito verificador de un CUIT de 11 dígitos con el algoritmo de módulo 11.
 * Un CUIT mal tipeado es más común de lo que parece y conviene atajarlo al cargarlo.
 */
export function cuitValido(cuit: string): boolean {
  const digitos = cuit.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digitos)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((t, peso, i) => t + peso * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(digitos[10]);
}

/** 20318453005 → '20-31845300-5' */
export function formatearCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}

/** CUIT opcional: se guarda sin guiones y se valida el dígito verificador. */
export const cuitSchema = z
  .string()
  .nullish()
  .transform((v) => {
    const d = (v ?? '').replace(/\D/g, '');
    return d ? d : null;
  })
  .refine((v) => v === null || /^\d{11}$/.test(v), 'El CUIT debe tener 11 dígitos')
  .refine((v) => v === null || cuitValido(v), 'El CUIT no es válido: revisá el dígito verificador');

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
  tipo: z.enum(TIPOS_SOCIO, { errorMap: () => ({ message: 'Elegí el tipo de socio' }) }).default('TITULAR'),
  cuit: cuitSchema,
  fechaNacimiento: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    fechaSchema
      .nullable()
      .refine((v) => v === null || v <= hoy(), 'La fecha de nacimiento no puede ser futura')
      .refine((v) => v === null || v >= '1900-01-01', 'Revisá la fecha de nacimiento'),
  ),
  /** El select manda '' cuando no se eligió ninguno. */
  estadoCivil: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.enum(ESTADOS_CIVILES, { errorMap: () => ({ message: 'Elegí un estado civil' }) }).nullable(),
  ),
  telefono: textoOpcional(30),
  direccion: textoOpcional(160),
  observaciones: textoOpcional(500),
  fechaAlta: fechaSchema.default(hoy),
  /** Documentación que el club va juntando de cada socio. */
  confirmado: z.coerce.boolean().default(false),
  fotocopiaDni: z.coerce.boolean().default(false),
  actaMatrimonio: z.coerce.boolean().default(false),
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
  /**
   * `moroso` son los socios activos con al menos una cuota vencida impaga, ordenados por
   * deuda de mayor a menor: es el listado desde el que se arman los planes de pago.
   * `suplente` son los que están en lista de espera para recibir una parcela.
   */
  estado: z.enum(['activo', 'baja', 'moroso', 'suplente', 'todos']).default('activo'),
  /** Loteo activo del sidebar: deja solo los socios con parcela vigente en ese loteo. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type SocioListarInput = z.input<typeof socioListarSchema>;
export type SocioListar = z.output<typeof socioListarSchema>;

export interface ParcelaResumen {
  id: number;
  codigo: string;
  /**
   * Cómo se nombra la parcela donde no hay contexto de loteo: «Lavalle · 7-1». El código
   * solo es único dentro del sector, así que suelto no alcanza para identificarla.
   */
  etiqueta: string;
  /** Nombre del sector (la manzana), o null si la parcela no tiene. */
  manzana: string | null;
}

export interface SocioListItem {
  id: number;
  numero: number;
  tipo: TipoSocio;
  nombre: string;
  apellido: string;
  dni: string;
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  fechaAlta: string;
  fechaBaja: string | null;
  estado: EstadoSocio;
  parcelas: ParcelaResumen[];
  /** Deuda acumulada de todas sus parcelas. */
  estadoCuenta: EstadoCuenta;
}

export interface AsignacionDeSocio {
  id: number;
  desde: string;
  hasta: string | null;
  parcela: ParcelaResumen & { sector: SectorResumen | null };
}

export interface SocioDetalle extends SocioListItem {
  direccion: string | null;
  observaciones: string | null;
  motivoBaja: string | null;
  fechaNacimiento: string | null;
  estadoCivil: EstadoCivil | null;
  confirmado: boolean;
  fotocopiaDni: boolean;
  actaMatrimonio: boolean;
  asignaciones: AsignacionDeSocio[];
}
