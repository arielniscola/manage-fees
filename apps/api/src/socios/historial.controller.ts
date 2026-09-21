import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ETIQUETA_COLUMNA_HISTORIAL, historialCrearSchema, hoy, type ColumnaHistorial, type HistorialCrear } from '@mf/shared';
import type { Response } from 'express';
import { reglaIncumplida } from '../common/errores';
import { armarCsv, type ArchivoSubido } from '../common/planilla';
import { ZodPipe } from '../common/zod.pipe';
import { HistorialService } from './historial.service';

/** 2 MB alcanzan de sobra para varios miles de cuotas. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Las columnas de la plantilla, en el orden en que conviene llenarlas. */
const ORDEN: ColumnaHistorial[] = ['dni', 'parcela', 'periodo', 'importe', 'estado', 'fechaPago', 'vencimiento'];

/** Dos cuotas de una parcela, la social del mismo mes y una que quedó adeudada. */
const EJEMPLOS = [
  ['28114502', '7-1', '2024-01', '12000', 'Pagada', '05/01/2024', ''],
  ['28114502', '', '2024-01', '4000', 'Pagada', '05/01/2024', ''],
  ['28114502', '7-1', '2024-02', '12000', 'Adeudada', '', ''],
  ['30115003', '7-3', '2024-01', '12000', 'Pagada', '10/01/2024', ''],
];

/**
 * Historial de cuotas de antes del sistema. Va antes que `SociosController` en el módulo:
 * si no, «socios/historial» lo toma «socios/:id».
 */
@Controller('socios/historial')
export class HistorialController {
  constructor(private readonly historial: HistorialService) {}

  /** Analiza el archivo y dice qué pasaría con cada fila, sin escribir nada. */
  @Post('previsualizar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  previsualizar(@UploadedFile() archivo?: ArchivoSubido) {
    return this.historial.previsualizar(exigirArchivo(archivo));
  }

  /** Carga las cuotas del archivo. Todo o nada. */
  @Post()
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  importar(@UploadedFile() archivo?: ArchivoSubido) {
    return this.historial.importar(exigirArchivo(archivo));
  }

  /** Planilla vacía con los encabezados y cuatro filas de ejemplo. */
  @Get('plantilla')
  plantilla(@Query('formato') formato: string | undefined, @Res() res: Response) {
    if (formato && formato !== 'csv') throw reglaIncumplida('La plantilla se descarga en CSV', 'formato');

    const csv = armarCsv([ORDEN.map((c) => ETIQUETA_COLUMNA_HISTORIAL[c]), ...EJEMPLOS]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="historial-${hoy()}.csv"`);
    res.end(csv);
  }
}

/** Carga a mano de un tramo de períodos, desde la ficha del socio. */
@Controller('socios/:socioId/historial')
export class HistorialDeSocioController {
  constructor(private readonly historial: HistorialService) {}

  @Post()
  cargar(
    @Param('socioId', ParseIntPipe) socioId: number,
    @Body(new ZodPipe(historialCrearSchema)) body: HistorialCrear,
  ) {
    return this.historial.cargar(socioId, body);
  }
}

function exigirArchivo(archivo?: ArchivoSubido): ArchivoSubido {
  if (!archivo?.buffer?.length) throw reglaIncumplida('Elegí el archivo del historial', 'archivo');
  return archivo;
}
