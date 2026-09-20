import { z } from 'zod';

/**
 * Los importes se guardan y viajan como enteros en centavos: sumar cuotas y armar
 * planes con decimales acumula errores de redondeo.
 */

/** 150050 → '$ 1.500,50' */
export function pesos(centavos: number, opciones?: { simbolo?: boolean }): string {
  const texto = (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opciones?.simbolo === false ? texto : `$ ${texto}`;
}

/** 150050 → '$ 1.500' si el importe es redondo, si no '$ 1.500,50'. Para tarjetas y totales. */
export function pesosCortos(centavos: number): string {
  if (centavos % 100 !== 0) return pesos(centavos);
  return `$ ${(centavos / 100).toLocaleString('es-AR')}`;
}

/**
 * Texto escrito por una persona → centavos. Acepta '1.500,50', '1500,5', '1500.50' y 1500.5.
 * Devuelve null si no se puede interpretar.
 */
export function aCentavos(valor: string | number): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }
  const limpio = valor.trim().replace(/^\$\s*/, '').replace(/\s/g, '');
  if (!limpio) return null;

  let normalizado: string;
  if (limpio.includes(',')) {
    // Formato local: el punto separa miles y la coma, decimales.
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else {
    // Sin coma, un punto con 1 o 2 dígitos atrás es decimal; con 3, separador de miles.
    const decimal = /\.\d{1,2}$/.test(limpio);
    normalizado = decimal ? limpio : limpio.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}

/** Importe de formulario: acepta texto o número y guarda centavos. */
export const importeSchema = z
  .union([z.string(), z.number()], { required_error: 'Ingresá el importe' })
  .transform((valor, ctx) => {
    const centavos = aCentavos(valor);
    if (centavos === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ingresá un importe válido, por ejemplo 1.500,50' });
      return z.NEVER;
    }
    return centavos;
  })
  .pipe(
    z
      .number()
      .int()
      .positive('El importe debe ser mayor a 0')
      .max(99_999_999_99, 'El importe es demasiado grande'),
  );

/** Importe que puede faltar o ser cero, como el anticipo opcional de un plan. */
export const importeOpcionalSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((valor, ctx) => {
    if (valor === null || valor === undefined || valor === '') return 0;
    const centavos = aCentavos(valor);
    if (centavos === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ingresá un importe válido, por ejemplo 1.500,50' });
      return z.NEVER;
    }
    return centavos;
  })
  .pipe(z.number().int().min(0, 'El importe no puede ser negativo').max(99_999_999_99, 'El importe es demasiado grande'));

/**
 * Reparte un total en n partes enteras de centavos. Las primeras absorben el resto de la
 * división, así la suma de las partes es siempre exactamente el total.
 */
export function repartir(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(total / partes);
  const sobrante = total - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < sobrante ? 1 : 0));
}
