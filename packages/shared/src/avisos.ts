import { z } from 'zod';
import { fechaSchema, paginacionSchema, textoOpcional } from './common';
import { pesos } from './dinero';
import type { SocioResumen } from './parcelas';

/**
 * Avisos de vencimiento por correo. El proceso diario junta las cuotas de cada socio y
 * manda un solo mail, aunque tenga varias parcelas por vencer.
 */

export const TIPOS_AVISO = ['PROXIMO_VENCIMIENTO', 'CUOTA_VENCIDA'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export const ETIQUETA_TIPO_AVISO: Record<TipoAviso, string> = {
  PROXIMO_VENCIMIENTO: 'Próximo vencimiento',
  CUOTA_VENCIDA: 'Cuota vencida',
};

export const RESULTADOS_ENVIO = ['ENVIADO', 'FALLIDO', 'SIN_EMAIL'] as const;
export type ResultadoEnvio = (typeof RESULTADOS_ENVIO)[number];

export const ETIQUETA_RESULTADO_ENVIO: Record<ResultadoEnvio, string> = {
  ENVIADO: 'Enviado',
  FALLIDO: 'Falló',
  SIN_EMAIL: 'Sin email',
};

/** Después de tantos intentos fallidos, el proceso deja de reintentar ese aviso. */
export const MAX_INTENTOS = 5;

// ---------------------------------------------------------------- Plantillas

/**
 * Marcas que se reemplazan en el asunto y el cuerpo. Se documentan en la pantalla de
 * configuración para que el club pueda editar los textos sin tocar código.
 */
export const MARCAS = {
  socio: 'Nombre y apellido del socio',
  club: 'Nombre del club',
  cantidad: 'Cuántas cuotas incluye el aviso',
  total: 'Importe total, por ejemplo $ 24.000,00',
  detalle: 'Una línea por cuota, con parcela, período, vencimiento e importe',
  vencimiento: 'Fecha de vencimiento más próxima, dd/mm/aaaa',
  dias: 'Días que faltan para vencer, o que pasaron desde el vencimiento',
} as const;
export type Marca = keyof typeof MARCAS;

export interface DatosPlantilla {
  socio: string;
  club: string;
  cantidad: number;
  total: number;
  detalle: string[];
  vencimiento: string;
  dias: number;
}

/** Reemplaza las marcas `{{nombre}}`. Una marca desconocida se deja tal cual, a la vista. */
export function renderizarPlantilla(texto: string, datos: DatosPlantilla): string {
  const valores: Record<Marca, string> = {
    socio: datos.socio,
    club: datos.club,
    cantidad: String(datos.cantidad),
    total: pesos(datos.total),
    detalle: datos.detalle.join('\n'),
    vencimiento: datos.vencimiento,
    dias: String(datos.dias),
  };
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (original, marca: string) =>
    marca in valores ? valores[marca as Marca] : original,
  );
}

export const ASUNTO_PROXIMO_POR_DEFECTO = '{{club}} · tu cuota vence el {{vencimiento}}';

export const CUERPO_PROXIMO_POR_DEFECTO = `Hola {{socio}},

Te recordamos que en {{dias}} días vence tu cuota social:

{{detalle}}

Total a pagar: {{total}}

Si ya la abonaste, ignorá este mensaje.

{{club}}`;

export const ASUNTO_VENCIDA_POR_DEFECTO = '{{club}} · tenés {{cantidad}} cuota(s) vencida(s)';

export const CUERPO_VENCIDA_POR_DEFECTO = `Hola {{socio}},

Nos figura sin pagar la siguiente deuda, vencida hace {{dias}} días:

{{detalle}}

Total adeudado: {{total}}

Si ya la abonaste o querés arreglar un plan de pago, escribinos.

{{club}}`;

// ---------------------------------------------------------------- Configuración

export const configuracionAvisosSchema = z.object({
  /** Con el proceso apagado no se manda nada, ni siquiera desde el botón. */
  activo: z.boolean().default(false),
  diasAntes: z.coerce
    .number({ invalid_type_error: 'Indicá un número de días' })
    .int('Indicá un número entero de días')
    .min(0, 'No puede ser negativo')
    .max(60, 'Máximo 60 días')
    .default(5),
  /** 0 desactiva el aviso de cuota vencida. */
  diasDespues: z.coerce
    .number({ invalid_type_error: 'Indicá un número de días' })
    .int('Indicá un número entero de días')
    .min(0, 'No puede ser negativo')
    .max(180, 'Máximo 180 días')
    .default(3),
  /** Hora de Argentina en que corre el proceso. */
  horaEnvio: z.coerce
    .number({ invalid_type_error: 'Indicá una hora' })
    .int('Indicá una hora entera')
    .min(0, 'Entre 0 y 23')
    .max(23, 'Entre 0 y 23')
    .default(9),
  remitenteNombre: textoOpcional(80),
  copiaOculta: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .pipe(z.string().email('Ingresá un email válido').nullable()),
  asuntoProximo: z.string().trim().min(1, 'Escribí el asunto').max(200, 'Máximo 200 caracteres'),
  cuerpoProximo: z.string().trim().min(1, 'Escribí el mensaje').max(4000, 'Máximo 4000 caracteres'),
  asuntoVencida: z.string().trim().min(1, 'Escribí el asunto').max(200, 'Máximo 200 caracteres'),
  cuerpoVencida: z.string().trim().min(1, 'Escribí el mensaje').max(4000, 'Máximo 4000 caracteres'),
});
export type ConfiguracionAvisosInput = z.input<typeof configuracionAvisosSchema>;
export type ConfiguracionAvisos = z.output<typeof configuracionAvisosSchema>;

export interface ConfiguracionAvisosCompleta extends ConfiguracionAvisos {
  /** Casilla desde la que salen los correos, tomada del SMTP del servidor. */
  remitenteEmail: string | null;
  /** El servidor tiene SMTP configurado; sin esto no se manda nada. */
  smtpConfigurado: boolean;
  /** Descripción del servidor de correo, para mostrar en la pantalla. */
  smtp: string | null;
}

// ---------------------------------------------------------------- Envíos

export const envioListarSchema = paginacionSchema.extend({
  q: z.string().trim().optional(),
  socioId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(TIPOS_AVISO).optional(),
  resultado: z.enum(RESULTADOS_ENVIO).optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
});
export type EnvioListarInput = z.input<typeof envioListarSchema>;
export type EnvioListar = z.output<typeof envioListarSchema>;

export interface EnvioListItem {
  id: number;
  fecha: string;
  tipo: TipoAviso;
  socio: SocioResumen & { telefono: string | null };
  email: string | null;
  asunto: string;
  cantidadCuotas: number;
  importe: number;
  resultado: ResultadoEnvio;
  error: string | null;
  intentos: number;
  enviadoEn: string | null;
}

export interface ResumenEnvios {
  enviados: number;
  fallidos: number;
  sinEmail: number;
}

export interface EnviosPaginados {
  items: EnvioListItem[];
  total: number;
  page: number;
  pageSize: number;
  resumen: ResumenEnvios;
}

// ---------------------------------------------------------------- Ejecución

export const ejecutarAvisosSchema = z.object({
  /** Calcula a quién le tocaría el aviso, sin mandar ni registrar nada. */
  simular: z.coerce.boolean().default(false),
});
export type EjecutarAvisosInput = z.input<typeof ejecutarAvisosSchema>;
export type EjecutarAvisos = z.output<typeof ejecutarAvisosSchema>;

export interface ResultadoAvisos {
  fecha: string;
  simulado: boolean;
  /** El proceso está apagado en la configuración. */
  inactivo: boolean;
  /** Falta configurar el SMTP en el servidor. */
  sinSmtp: boolean;
  proximos: number;
  vencidas: number;
  enviados: number;
  fallidos: number;
  sinEmail: number;
  /** Avisos de días anteriores que fallaron y se reintentaron en esta corrida. */
  reintentos: number;
  /** Quiénes recibirían el aviso, para la vista previa. */
  destinatarios: {
    socio: SocioResumen;
    tipo: TipoAviso;
    email: string | null;
    cantidadCuotas: number;
    importe: number;
  }[];
}

export const avisoPruebaSchema = z.object({
  email: z
    .string({ required_error: 'Ingresá un email' })
    .trim()
    .toLowerCase()
    .email('Ingresá un email válido'),
  tipo: z.enum(TIPOS_AVISO).default('PROXIMO_VENCIMIENTO'),
});
export type AvisoPruebaInput = z.input<typeof avisoPruebaSchema>;
export type AvisoPrueba = z.output<typeof avisoPruebaSchema>;
