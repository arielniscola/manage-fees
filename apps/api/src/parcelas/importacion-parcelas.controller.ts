import { Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ETIQUETA_COLUMNA_PARCELAS, hoy } from '@mf/shared';
import type { Response } from 'express';
import { reglaIncumplida } from '../common/errores';
import { armarCsv, type ArchivoSubido } from '../common/planilla';
import { ImportacionParcelasService } from './importacion-parcelas.service';

/** 2 MB, igual que el padrón. */
const MAX_BYTES = 2 * 1024 * 1024;

const EJEMPLOS = [
  ['7', '1', '259,04', ''],
  ['7', '2', '300', ''],
  ['8', '1', '251,36', 'Esquina'],
];

@Controller('parcelas/importar')
export class ImportacionParcelasController {
  constructor(private readonly importacion: ImportacionParcelasService) {}

  /** Analiza el archivo y dice qué pasaría con cada fila, sin escribir nada. */
  @Post('previsualizar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  previsualizar(@UploadedFile() archivo?: ArchivoSubido, @Query('loteoId') loteoId?: string) {
    return this.importacion.previsualizar(exigirArchivo(archivo), exigirLoteo(loteoId));
  }

  /** Crea las manzanas y lotes que faltan y actualiza la superficie de los que cambiaron. */
  @Post()
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES } }))
  importar(@UploadedFile() archivo?: ArchivoSubido, @Query('loteoId') loteoId?: string) {
    return this.importacion.importar(exigirArchivo(archivo), exigirLoteo(loteoId));
  }

  /** Planilla vacía con los encabezados y tres filas de ejemplo. */
  @Get('plantilla')
  plantilla(@Res() res: Response) {
    const encabezados = (['manzana', 'lote', 'superficie', 'descripcion'] as const).map((c) => ETIQUETA_COLUMNA_PARCELAS[c]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="parcelas-${hoy()}.csv"`);
    res.end(armarCsv([encabezados, ...EJEMPLOS]));
  }
}

function exigirArchivo(archivo?: ArchivoSubido): ArchivoSubido {
  if (!archivo?.buffer?.length) throw reglaIncumplida('Elegí el archivo de parcelas', 'archivo');
  return archivo;
}

/** Sin loteo no se sabe dónde crear las manzanas: es obligatorio. */
function exigirLoteo(loteoId?: string): number {
  const id = Number(loteoId);
  if (!loteoId || !Number.isInteger(id) || id <= 0) throw reglaIncumplida('Elegí el loteo de las parcelas', 'loteoId');
  return id;
}
