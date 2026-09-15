/** '2026-09-14' → '14/09/2026' */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2015-08-10' → 'agosto 2015' */
export function mesAnio(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}

/** '30458217' → '30.458.217' */
export function dni(valor: string): string {
  return valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function nombreCompleto(s: { nombre: string; apellido: string }): string {
  return `${s.nombre} ${s.apellido}`;
}

export function iniciales(s: { nombre: string; apellido: string }): string {
  return `${s.nombre[0] ?? ''}${s.apellido[0] ?? ''}`.toUpperCase();
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString('es-AR')} ${n === 1 ? singular : pluralForm}`;
}
