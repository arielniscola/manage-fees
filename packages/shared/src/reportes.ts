import { z } from 'zod';
import { fechaSchema, hoy } from './common';
import type { SocioResumen } from './parcelas';

/** Primer día del mes en curso, el arranque natural del panel. */
export const inicioDelMes = (): string => `${hoy().slice(0, 7)}-01`;

// ---------------------------------------------------------------- Panel

export const panelSchema = z.object({
  desde: fechaSchema.default(inicioDelMes),
  hasta: fechaSchema.default(hoy),
  /** Cuántos meses muestra el gráfico de evolución. */
  meses: z.coerce.number().int().min(3).max(24).default(12),
  /** Loteo activo del sidebar: acota todos los números del panel a ese loteo. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type PanelInput = z.input<typeof panelSchema>;
export type PanelConsulta = z.output<typeof panelSchema>;

export interface MesDeEvolucion {
  mes: string;
  etiqueta: string;
  /** Centavos de cuotas que vencían en ese mes, sin contar las anuladas. */
  emitido: number;
  /** Centavos efectivamente cobrados en ese mes. */
  cobrado: number;
}

export interface Panel {
  desde: string;
  hasta: string;
  /** Centavos cobrados en el rango, sin contar los cobros anulados. */
  cobrado: number;
  cobros: number;
  /** Deuda al día de hoy, no del rango: las cuotas impagas no tienen fecha de corte. */
  deudaTotal: number;
  deudaVencida: number;
  cuotasPendientes: number;
  cuotasVencidas: number;
  sociosActivos: number;
  sociosEnMora: number;
  /** Socios en mora sobre socios activos, de 0 a 100. */
  morosidad: number;
  parcelasAsignadas: number;
  parcelasTotales: number;
  planesVigentes: number;
  evolucion: MesDeEvolucion[];
  topMorosos: { socio: SocioResumen; vencidas: number; deuda: number }[];
}

// ---------------------------------------------------------------- Exportación

export const TIPOS_REPORTE = ['socios', 'cobros', 'morosos', 'planes'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const ETIQUETA_REPORTE: Record<TipoReporte, string> = {
  socios: 'Socios',
  cobros: 'Cobros',
  morosos: 'Morosos',
  planes: 'Planes de pago',
};

export const DESCRIPCION_REPORTE: Record<TipoReporte, string> = {
  socios: 'Padrón completo con contacto, parcelas y estado de cuenta de cada socio.',
  cobros: 'Cobros del período con su recibo, medio de pago y total. El total coincide con el del panel.',
  morosos: 'Socios con cuotas vencidas impagas, del que más debe al que menos.',
  planes: 'Planes de pago con su deuda refinanciada, lo cobrado y el saldo.',
};

/** Los reportes de socios y morosos son una foto de hoy; los otros dos usan el rango. */
export const USA_RANGO: Record<TipoReporte, boolean> = {
  socios: false,
  cobros: true,
  morosos: false,
  planes: true,
};

export const FORMATOS = ['xlsx', 'csv'] as const;
export type Formato = (typeof FORMATOS)[number];

export const reporteSchema = z.object({
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  formato: z.enum(FORMATOS).default('xlsx'),
  /** Loteo activo del sidebar. */
  loteoId: z.coerce.number().int().positive().optional(),
});
export type ReporteInput = z.input<typeof reporteSchema>;
export type ReporteConsulta = z.output<typeof reporteSchema>;
