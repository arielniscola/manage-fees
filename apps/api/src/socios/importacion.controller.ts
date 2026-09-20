import { Controller, Get, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ETIQUETA_COLUMNA, hoy, type ColumnaImportacion } from '@mf/shared';
import type { Response } from 'express';
import { reglaIncumplida } from '../common/errores';
import { ImportacionService, type ArchivoSubido } from './importacion.service';

/** 2 MB alcanzan de sobra para un padrón de varios miles de filas. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Las columnas de la plantilla, en el orden de la planilla del padrón: una fila por lote. */
const ORDEN: ColumnaImportacion[] = [
  'manzana',
  'lote',
  'superficie',
  'nombreCompleto',
  'dni',
  'cuit',
  'fechaNacimiento',
  'estadoCivil',
  'direccion',
  'telefono',
  'email',
  'fechaAlta',
  'confirmado',
  'fotocopiaDni',
  'actaMatrimonio',
  'observaciones',
];

/** Un socio con dos lotes, que aparece dos veces con el mismo DNI, y un lote todavía libre. */
const EJEMPLOS = [
  ['7', '1', '259,04', 'FERREYRA, CARLOS', '28114502', '20-28114502-3', '12/05/1980', 'Casado/a', 'San Martín 450, Maipú', '2614123456', 'carlos@mail.com', '', 'Sí', 'Sí', 'No', ''],
  ['7', '2', '300', 'FERREYRA, CARLOS', '28114502', '20-28114502-3', '12/05/1980', 'Casado/a', 'San Martín 450, Maipú', '2614123456', 'carlos@mail.com', '', 'Sí', 'Sí', 'No', ''],
  ['7', '3', '251,36', '', '', '', '', '', '', '', '', '', '', '', '', 'Lote libre'],
];

@Controller('socios/importar')
export class ImportacionController {
  constructor(private readonly importacion: ImportacionService) {}

  /** Analiza el archivo y dice qué pasaría con cada fila, sin escribir nada. */
  @Post('previsualizar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  previsualizar(
    @UploadedFile() archivo?: ArchivoSubido,
    @Query('loteoId', new ParseIntPipe({ optional: true })) loteoId?: number,
  ) {
    return this.importacion.previsualizar(exigirArchivo(archivo), loteoId);
  }

  /**
   * Da de alta las filas nuevas con sus parcelas. Con `loteoId`, crea en ese loteo las
   * manzanas y lotes que falten. Todo o nada.
   */
  @Post()
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  importar(
    @UploadedFile() archivo?: ArchivoSubido,
    @Query('loteoId', new ParseIntPipe({ optional: true })) loteoId?: number,
  ) {
    return this.importacion.importar(exigirArchivo(archivo), loteoId);
  }

  /** Planilla vacía con los encabezados y tres filas de ejemplo. */
  @Get('plantilla')
  plantilla(@Query('formato') formato: string | undefined, @Res() res: Response) {
    const encabezados = ORDEN.map((c) => ETIQUETA_COLUMNA[c]);
    const filas = [encabezados, ...EJEMPLOS];
    // Punto y coma y BOM: es lo que abre bien el Excel en español, igual que los reportes.
    const csv = '﻿' + filas.map((f) => f.map(entrecomillar).join(';')).join('\r\n');

    if (formato && formato !== 'csv') throw reglaIncumplida('La plantilla se descarga en CSV', 'formato');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="padron-${hoy()}.csv"`);
    res.end(Buffer.from(csv, 'utf8'));
  }
}

const entrecomillar = (valor: string): string => (/[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor);

function exigirArchivo(archivo?: ArchivoSubido): ArchivoSubido {
  if (!archivo?.buffer?.length) throw reglaIncumplida('Elegí el archivo del padrón', 'archivo');
  return archivo;
}
