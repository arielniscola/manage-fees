/**
 * Un período se identifica por su primer mes, 'AAAA-MM', y dura tantos meses como
 * indique la periodicidad de la tarifa. Los períodos de un año arrancan en enero y
 * se suceden sin huecos (1, 1+N, 1+2N…), así que dos parcelas nunca quedan desfasadas.
 *
 * Toda la aritmética trabaja sobre strings para no depender de la zona horaria.
 */

export const PERIODICIDADES = ['MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number];

export const MESES_DE: Record<Periodicidad, number> = {
  MENSUAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

export const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = {
  MENSUAL: 'Mensual',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

const partes = (periodo: string): [number, number] => {
  const [a, m] = periodo.split('-');
  return [Number(a), Number(m)];
};

const armar = (anio: number, mes: number): string => `${anio}-${String(mes).padStart(2, '0')}`;

/** Días que tiene un mes, contemplando años bisiestos. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** 'AAAA-MM' + n meses. n puede ser negativo. */
export function sumarMeses(periodo: string, n: number): string {
  const [anio, mes] = partes(periodo);
  const total = anio * 12 + (mes - 1) + n;
  return armar(Math.floor(total / 12), (total % 12) + 1);
}

/** Meses de diferencia entre dos períodos: sumarMeses(a, mesesEntre(a, b)) === b. */
export function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1] = partes(desde);
  const [a2, m2] = partes(hasta);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** El mes al que pertenece una fecha 'AAAA-MM-DD'. */
export const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** Período que contiene a la fecha o mes indicado, alineado al año. */
export function inicioPeriodo(fechaOMes: string, periodicidad: Periodicidad): string {
  const [anio, mes] = partes(mesDe(fechaOMes));
  const n = MESES_DE[periodicidad];
  return armar(anio, Math.floor((mes - 1) / n) * n + 1);
}

/** Primer día del período: 'AAAA-MM-01'. */
export const primerDia = (periodo: string): string => `${periodo}-01`;

/** Último día del período, según cuántos meses abarque. */
export function ultimoDia(periodo: string, periodicidad: Periodicidad): string {
  const ultimoMes = sumarMeses(periodo, MESES_DE[periodicidad] - 1);
  const [anio, mes] = partes(ultimoMes);
  return `${ultimoMes}-${String(diasDelMes(anio, mes)).padStart(2, '0')}`;
}

/**
 * Vencimiento de la cuota: el día configurado dentro del primer mes del período.
 * Un día 31 en un mes más corto cae en el último día del mes.
 */
export function vencimientoDe(periodo: string, diaVencimiento: number): string {
  const [anio, mes] = partes(periodo);
  const dia = Math.min(diaVencimiento, diasDelMes(anio, mes));
  return `${periodo}-${String(dia).padStart(2, '0')}`;
}

/** 'septiembre 2026', 'septiembre–octubre 2026', 'noviembre 2026 – abril 2027' o 'Año 2026'. */
export function etiquetaPeriodo(periodo: string, periodicidad: Periodicidad): string {
  const [anio, mes] = partes(periodo);
  if (periodicidad === 'ANUAL') return `Año ${anio}`;
  if (periodicidad === 'MENSUAL') return `${MESES[mes - 1]} ${anio}`;

  const [anioFin, mesFin] = partes(sumarMeses(periodo, MESES_DE[periodicidad] - 1));
  return anio === anioFin
    ? `${MESES[mes - 1]}–${MESES[mesFin - 1]} ${anio}`
    : `${MESES[mes - 1]} ${anio} – ${MESES[mesFin - 1]} ${anioFin}`;
}

/** Forma corta para tablas: 'sep 2026', 'sep–oct 2026', '2026'. */
export function etiquetaPeriodoCorta(periodo: string, periodicidad: Periodicidad): string {
  const [anio, mes] = partes(periodo);
  if (periodicidad === 'ANUAL') return String(anio);
  const corto = (m: number) => MESES[m - 1].slice(0, 3);
  if (periodicidad === 'MENSUAL') return `${corto(mes)} ${anio}`;

  const [anioFin, mesFin] = partes(sumarMeses(periodo, MESES_DE[periodicidad] - 1));
  return anio === anioFin ? `${corto(mes)}–${corto(mesFin)} ${anio}` : `${corto(mes)} ${anio}–${corto(mesFin)} ${anioFin}`;
}
