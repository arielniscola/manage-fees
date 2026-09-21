import ExcelJS from 'exceljs';
import { reglaIncumplida } from './errores';

/**
 * Lectura de una planilla subida, en Excel o CSV. Devuelve todo como texto: interpretar
 * cada celda es tarea de quien analiza las filas, que sabe qué significa cada columna.
 *
 * La usan las dos importaciones, la del padrón y la del historial de cuotas.
 */

export interface ArchivoSubido {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface Planilla {
  encabezados: string[];
  filas: string[][];
}

export async function leerPlanilla(archivo: ArchivoSubido, maxFilas: number): Promise<Planilla> {
  const nombre = archivo.originalname.toLowerCase();
  const contenido = nombre.endsWith('.csv') ? leerCsv(archivo.buffer) : await leerExcel(archivo.buffer);

  if (contenido.encabezados.length === 0) throw reglaIncumplida('El archivo está vacío', 'archivo');
  if (contenido.filas.length > maxFilas) {
    throw reglaIncumplida(`El archivo tiene más de ${maxFilas} filas: partilo en varios`, 'archivo');
  }
  return contenido;
}

async function leerExcel(buffer: Buffer): Promise<Planilla> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw reglaIncumplida('No se pudo leer el archivo: tiene que ser un Excel (.xlsx) o un CSV', 'archivo');
  }

  const hoja = libro.worksheets[0];
  if (!hoja) return { encabezados: [], filas: [] };

  const filas: string[][] = [];
  let encabezados: string[] = [];
  hoja.eachRow((fila, numero) => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      celdas[columna - 1] = textoDeCelda(celda.value);
    });
    const completas = Array.from({ length: celdas.length }, (_, i) => celdas[i] ?? '');
    if (numero === 1) encabezados = completas;
    else if (completas.some((c) => c.trim() !== '')) filas.push(completas);
  });
  return { encabezados, filas };
}

/** CSV con `;` o `,`, con o sin comillas y con el BOM que le pone el Excel en español. */
function leerCsv(buffer: Buffer): Planilla {
  const texto = buffer.toString('utf8').replace(/^﻿/, '');
  const lineas = partirEnLineas(texto);
  if (lineas.length === 0) return { encabezados: [], filas: [] };

  const separador = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const [encabezado, ...resto] = lineas.map((l) => partirCampos(l, separador));
  return { encabezados: encabezado, filas: resto.filter((f) => f.some((c) => c.trim() !== '')) };
}

const textoDeCelda = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  // Formato de fecha con un valor imposible: que el análisis lo muestre en vez de romper.
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? 'fecha inválida' : valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return textoDeCelda(v.result);
    return '';
  }
  return String(valor);
};

/** Separa por saltos de línea respetando los que están dentro de comillas. */
function partirEnLineas(texto: string): string[] {
  const lineas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') entreComillas = !entreComillas;
    if (!entreComillas && (c === '\n' || c === '\r')) {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      if (actual.trim() !== '') lineas.push(actual);
      actual = '';
    } else actual += c;
  }
  if (actual.trim() !== '') lineas.push(actual);
  return lineas;
}

function partirCampos(linea: string, separador: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      // Dos comillas seguidas dentro de un campo son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (c === separador && !entreComillas) {
      campos.push(actual);
      actual = '';
    } else actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

/** Una fila de CSV, con las comillas que haga falta. Para las plantillas que se bajan. */
export const entrecomillar = (valor: string): string =>
  /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

/** CSV listo para el Excel en español: punto y coma y BOM. */
export const armarCsv = (filas: string[][]): Buffer =>
  Buffer.from('﻿' + filas.map((f) => f.map(entrecomillar).join(';')).join('\r\n'), 'utf8');
