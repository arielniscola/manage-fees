import { ZONA_HORARIA } from '@mf/shared';

/** Las fechas de negocio viajan como 'YYYY-MM-DD' y se guardan como DATE (medianoche UTC). */
export const aFecha = (s: string): Date => new Date(`${s}T00:00:00Z`);

export const deFecha = (d: Date): string => d.toISOString().slice(0, 10);

export const deFechaNullable = (d: Date | null): string | null => (d ? deFecha(d) : null);

/** Formato para mensajes al usuario: dd/mm/aaaa. */
export const fechaLegible = (d: Date | string): string => {
  const [a, m, dia] = (typeof d === 'string' ? d : deFecha(d)).split('-');
  return `${dia}/${m}/${a}`;
};

/**
 * Momento exacto (ISO con hora) en hora de Argentina: '15/09/2026 a las 14:32'.
 * Los comprobantes guardan el instante en UTC, pero se imprimen en hora local.
 */
export const fechaHoraLegible = (iso: string | Date): string => {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA_HORARIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} a las ${p('hour')}:${p('minute')}`;
};
