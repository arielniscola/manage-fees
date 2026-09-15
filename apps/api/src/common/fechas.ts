/** Las fechas de negocio viajan como 'YYYY-MM-DD' y se guardan como DATE (medianoche UTC). */
export const aFecha = (s: string): Date => new Date(`${s}T00:00:00Z`);

export const deFecha = (d: Date): string => d.toISOString().slice(0, 10);

export const deFechaNullable = (d: Date | null): string | null => (d ? deFecha(d) : null);

/** Formato para mensajes al usuario: dd/mm/aaaa. */
export const fechaLegible = (d: Date | string): string => {
  const [a, m, dia] = (typeof d === 'string' ? d : deFecha(d)).split('-');
  return `${dia}/${m}/${a}`;
};
