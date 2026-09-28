import { COLUMNAS_IMPORTACION, normalizarEncabezado, superficieDeTexto } from './importacion';

/**
 * Importación de parcelas sola, sin socios: manzana, lote y superficie. Sirve para cargar
 * el mapa del loteo antes que el padrón, o para completar los m² de lotes ya cargados.
 * Lee la misma planilla que el padrón —una fila por lote— e ignora el resto de las columnas.
 *
 * El análisis de las filas vive acá; si la manzana y el lote ya existen lo resuelve la API.
 */

/** Las columnas que se leen, con los mismos nombres alternativos que el padrón. */
export const COLUMNAS_IMPORTACION_PARCELAS = {
  manzana: COLUMNAS_IMPORTACION.manzana,
  lote: COLUMNAS_IMPORTACION.lote,
  superficie: COLUMNAS_IMPORTACION.superficie,
  descripcion: ['descripcion', 'detalle'],
} as const;

export type ColumnaImportacionParcelas = keyof typeof COLUMNAS_IMPORTACION_PARCELAS;

export const COLUMNAS_OBLIGATORIAS_PARCELAS: ColumnaImportacionParcelas[] = ['manzana', 'lote'];

export const ETIQUETA_COLUMNA_PARCELAS: Record<ColumnaImportacionParcelas, string> = {
  manzana: 'Manzana',
  lote: 'Lote',
  superficie: 'M2',
  descripcion: 'Descripción',
};

/**
 * Qué va a pasar con la fila. `actualiza` es un lote que ya existe y cambia su superficie;
 * `sinCambios`, uno que ya existe igual; `repetida`, el mismo lote más arriba en el archivo.
 * La API completa `actualiza` y `sinCambios` mirando la base.
 */
export type EstadoFilaParcela = 'nueva' | 'actualiza' | 'sinCambios' | 'repetida' | 'error';

export interface FilaImportacionParcela {
  /** Número de fila en la planilla, contando el encabezado. */
  fila: number;
  estado: EstadoFilaParcela;
  errores: string[];
  advertencias: string[];
  manzana: string;
  lote: string;
  /** «manzana-lote», como las crea la importación del padrón. */
  codigo: string;
  superficieM2: number | null;
  descripcion: string | null;
  /** Lo marca la API: la manzana no existe en el loteo y se crea. */
  manzanaNueva?: boolean;
  /** Lo marca la API: la superficie que tiene hoy el lote, cuando se actualiza. */
  superficieAnterior?: number | null;
  /** En una fila `repetida`, la fila donde el lote aparece primero. */
  repetidaDe?: number;
}

export interface ResultadoImportacionParcelas {
  filas: FilaImportacionParcela[];
  total: number;
  nuevas: number;
  actualizadas: number;
  sinCambios: number;
  repetidas: number;
  conError: number;
  conAdvertencias: number;
  /** Manzanas que no existen en el loteo y se crean. */
  manzanasNuevas: number;
  columnasFaltantes: ColumnaImportacionParcelas[];
}

export function mapearColumnasParcelas(encabezados: string[]): Map<number, ColumnaImportacionParcelas> {
  const mapa = new Map<number, ColumnaImportacionParcelas>();
  const usadas = new Set<ColumnaImportacionParcelas>();
  encabezados.forEach((encabezado, i) => {
    const normalizado = normalizarEncabezado(encabezado ?? '');
    if (!normalizado) return;
    for (const [columna, alias] of Object.entries(COLUMNAS_IMPORTACION_PARCELAS) as [ColumnaImportacionParcelas, readonly string[]][]) {
      if (usadas.has(columna) || !alias.includes(normalizado)) continue;
      mapa.set(i, columna);
      usadas.add(columna);
      return;
    }
  });
  return mapa;
}

/**
 * Analiza las filas de la planilla. Las que no tienen ni manzana ni lote —totales, renglones
 * en blanco, títulos— se saltean sin avisar.
 */
export function analizarFilasParcelas(encabezados: string[], filas: string[][]): ResultadoImportacionParcelas {
  const columnas = mapearColumnasParcelas(encabezados);
  const presentes = new Set(columnas.values());
  const faltantes = COLUMNAS_OBLIGATORIAS_PARCELAS.filter((c) => !presentes.has(c));
  if (faltantes.length > 0) return resumirParcelas([], faltantes);

  const valorDe = (fila: string[], columna: ColumnaImportacionParcelas): string => {
    for (const [i, c] of columnas) if (c === columna) return (fila[i] ?? '').toString().trim();
    return '';
  };

  const analizadas: FilaImportacionParcela[] = [];
  /** Manzana|lote → la primera fila donde aparece. */
  const vistas = new Map<string, FilaImportacionParcela>();

  filas.forEach((celdas, i) => {
    const fila = i + 2;
    const manzana = valorDe(celdas, 'manzana');
    const lote = valorDe(celdas, 'lote');
    if (!manzana && !lote) return;

    const errores: string[] = [];
    const advertencias: string[] = [];
    if (!manzana) errores.push(`Falta la manzana del lote ${lote}`);
    if (!lote) errores.push(`Falta el lote de la manzana ${manzana}`);

    const textoSuperficie = valorDe(celdas, 'superficie');
    let superficieM2 = superficieDeTexto(textoSuperficie);
    if (superficieM2 === undefined) {
      advertencias.push(`No se entiende la superficie «${textoSuperficie}»: el lote queda sin m²`);
      superficieM2 = null;
    }

    const analizada: FilaImportacionParcela = {
      fila,
      estado: 'nueva',
      errores,
      advertencias,
      manzana,
      lote,
      codigo: `${manzana}-${lote}`,
      superficieM2,
      descripcion: valorDe(celdas, 'descripcion') || null,
    };

    if (errores.length === 0) {
      // En la planilla del padrón el lote de un socio con dos titulares puede repetirse: si
      // dice lo mismo se saltea, y si la superficie no coincide no hay forma de elegir.
      const clave = claveLote(manzana, lote);
      const primera = vistas.get(clave);
      if (primera) {
        const distinta = superficieM2 !== null && primera.superficieM2 !== null && superficieM2 !== primera.superficieM2;
        if (distinta) {
          errores.push(`El lote ${analizada.codigo} ya aparece en la fila ${primera.fila} con otra superficie (${primera.superficieM2} m²)`);
        } else {
          analizada.estado = 'repetida';
          analizada.repetidaDe = primera.fila;
          // Si la primera no traía superficie y esta sí, se aprovecha.
          if (primera.superficieM2 === null && superficieM2 !== null) primera.superficieM2 = superficieM2;
        }
      } else vistas.set(clave, analizada);
    }

    if (errores.length > 0) analizada.estado = 'error';
    analizadas.push(analizada);
  });

  return resumirParcelas(analizadas, faltantes);
}

/** El mismo lote aunque cambien mayúsculas, espacios o ceros: «7», «07» y « 7 » son lo mismo. */
export const claveLote = (manzana: string, lote: string): string => `${normalizarNumero(manzana)}|${normalizarNumero(lote)}`;

/** Una manzana o un lote para comparar: sin acentos ni signos y, si es un número, sin ceros adelante. */
export const normalizarNumero = (texto: string): string => {
  const limpio = normalizarEncabezado(texto);
  return /^\d+$/.test(limpio) ? String(Number(limpio)) : limpio;
};

export function resumirParcelas(
  filas: FilaImportacionParcela[],
  columnasFaltantes: ColumnaImportacionParcelas[] = [],
): ResultadoImportacionParcelas {
  const cuantas = (estado: EstadoFilaParcela) => filas.filter((f) => f.estado === estado).length;
  const manzanas = new Set(
    filas.filter((f) => f.estado === 'nueva' && f.manzanaNueva).map((f) => normalizarNumero(f.manzana)),
  );
  return {
    filas,
    total: filas.length,
    nuevas: cuantas('nueva'),
    actualizadas: cuantas('actualiza'),
    sinCambios: cuantas('sinCambios'),
    repetidas: cuantas('repetida'),
    conError: cuantas('error'),
    conAdvertencias: filas.filter((f) => f.estado !== 'error' && f.advertencias.length > 0).length,
    manzanasNuevas: manzanas.size,
    columnasFaltantes,
  };
}
