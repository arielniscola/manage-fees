import { Injectable } from '@nestjs/common';
import { ETIQUETA_REPORTE, USA_RANGO, hoy, type Formato, type TipoReporte } from '@mf/shared';
import ExcelJS from 'exceljs';
import {
  COLUMNAS_COBROS,
  CUENTA_EN_TOTAL,
  COLUMNAS_MOROSOS,
  COLUMNAS_PLANES,
  COLUMNAS_SOCIOS,
  ConsultasService,
  tituloDeReporte,
  type Columna,
  type Rango,
} from './consultas.service';

const NOMBRE_CLUB = process.env.CLUB_NOMBRE || 'Club';

/** Formato de moneda en el Excel: miles con punto, decimales con coma. */
const FORMATO_MONEDA = '"$"#,##0.00';

const PINO = 'FF2B5337';
const FONDO = 'FFFAF6EE';
const BORDE = 'FFE2DACB';

interface Reporte {
  /** Nombre corto para la pestaña del Excel. */
  etiqueta: string;
  titulo: string;
  columnas: Columna<unknown>[];
  filas: unknown[];
  /** Qué filas entran en la fila de totales. */
  cuentaEnTotal: (fila: unknown) => boolean;
}

@Injectable()
export class ExportacionService {
  constructor(private readonly consultas: ConsultasService) {}

  async generar(tipo: TipoReporte, rango: Rango, formato: Formato): Promise<{ nombre: string; contenido: Buffer; tipoMime: string }> {
    const reporte = await this.armar(tipo, rango);
    const nombre = `${tipo}-${hoy()}.${formato}`;

    return formato === 'csv'
      ? { nombre, contenido: this.aCsv(reporte), tipoMime: 'text/csv; charset=utf-8' }
      : {
          nombre,
          contenido: await this.aExcel(reporte),
          tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
  }

  private async armar(tipo: TipoReporte, rango: Rango): Promise<Reporte> {
    // El rango solo aplica donde tiene sentido: el padrón y los morosos son una foto de hoy.
    // El loteo, en cambio, acota todos los reportes por igual.
    const efectivo: Rango = USA_RANGO[tipo] ? rango : { loteoId: rango.loteoId };
    const loteo = await this.consultas.nombreDeLoteo(rango.loteoId);
    const cuentaEnTotal = (CUENTA_EN_TOTAL[tipo] ?? (() => true)) as (fila: unknown) => boolean;
    const como = <T>(columnas: Columna<T>[], filas: T[]): Reporte => ({
      etiqueta: ETIQUETA_REPORTE[tipo],
      titulo: tituloDeReporte(ETIQUETA_REPORTE[tipo], efectivo, loteo),
      columnas: columnas as Columna<unknown>[],
      filas,
      cuentaEnTotal,
    });

    switch (tipo) {
      case 'socios':
        return como(COLUMNAS_SOCIOS, await this.consultas.padron(rango.loteoId));
      case 'morosos':
        return como(COLUMNAS_MOROSOS, await this.consultas.morosos(rango.loteoId));
      case 'planes':
        return como(COLUMNAS_PLANES, await this.consultas.planesDelRango(efectivo));
      case 'cobros':
        return como(COLUMNAS_COBROS, (await this.consultas.cobrosDelRango(efectivo)).filas);
    }
  }

  private async aExcel({ etiqueta, titulo, columnas, filas, cuentaEnTotal }: Reporte): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = NOMBRE_CLUB;
    libro.created = new Date();
    const hoja = libro.addWorksheet(nombreDeHoja(etiqueta));

    // Dos líneas de encabezado con el club y el alcance del reporte.
    hoja.mergeCells(1, 1, 1, columnas.length);
    const cabecera = hoja.getCell(1, 1);
    cabecera.value = NOMBRE_CLUB;
    cabecera.font = { bold: true, size: 14, color: { argb: PINO } };

    hoja.mergeCells(2, 1, 2, columnas.length);
    const subtitulo = hoja.getCell(2, 1);
    subtitulo.value = titulo;
    subtitulo.font = { size: 10, color: { argb: 'FF6D6A5F' } };

    const filaTitulos = hoja.getRow(4);
    columnas.forEach((c, i) => {
      const celda = filaTitulos.getCell(i + 1);
      celda.value = c.titulo;
      celda.font = { bold: true, size: 10 };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO } };
      celda.border = { bottom: { style: 'thin', color: { argb: BORDE } } };
      hoja.getColumn(i + 1).width = c.ancho;
    });
    filaTitulos.commit();

    for (const fila of filas) {
      const valores = columnas.map((c) => (c.moneda ? Number(c.valor(fila)) / 100 : c.valor(fila)));
      const agregada = hoja.addRow(valores);
      columnas.forEach((c, i) => {
        if (c.moneda) agregada.getCell(i + 1).numFmt = FORMATO_MONEDA;
      });
    }

    this.agregarTotales(hoja, columnas, filas, cuentaEnTotal);
    hoja.views = [{ state: 'frozen', ySplit: 4 }];
    hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnas.length } };

    const buffer = await libro.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Una fila final con la suma de cada columna de dinero. Solo suma las filas que cuentan
   * —un cobro anulado no es plata que entró— para que el total cuadre con el del panel.
   */
  private agregarTotales(
    hoja: ExcelJS.Worksheet,
    columnas: Columna<unknown>[],
    filas: unknown[],
    cuentaEnTotal: (fila: unknown) => boolean,
  ) {
    if (filas.length === 0 || !columnas.some((c) => c.moneda)) return;

    const suman = filas.filter(cuentaEnTotal);
    const valores = columnas.map((c, i) => {
      if (i === 0) return rotuloDeTotal(suman.length, filas.length);
      if (!c.moneda) return '';
      return suman.reduce((t: number, f) => t + Number(c.valor(f)), 0) / 100;
    });

    const fila = hoja.addRow(valores);
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      celda.font = { bold: true };
      celda.border = { top: { style: 'thin', color: { argb: BORDE } } };
      if (c.moneda) celda.numFmt = FORMATO_MONEDA;
    });
  }

  /**
   * CSV con punto y coma y BOM: es lo que abre bien el Excel en español sin pasar por el
   * asistente de importación. Los importes van con coma decimal, como el resto del sistema.
   */
  private aCsv({ columnas, filas, cuentaEnTotal }: Reporte): Buffer {
    const escapar = (valor: string | number): string => {
      const texto = String(valor);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const enPesos = (c: Columna<unknown>, fila: unknown): string =>
      (Number(c.valor(fila)) / 100).toFixed(2).replace('.', ',');

    const lineas = [columnas.map((c) => escapar(c.titulo)).join(';')];
    for (const fila of filas) {
      lineas.push(columnas.map((c) => escapar(c.moneda ? enPesos(c, fila) : c.valor(fila))).join(';'));
    }

    // La misma fila de totales que el Excel, para poder cuadrar sin abrir la planilla.
    if (filas.length > 0 && columnas.some((c) => c.moneda)) {
      const suman = filas.filter(cuentaEnTotal);
      lineas.push(
        columnas
          .map((c, i) => {
            if (i === 0) return escapar(rotuloDeTotal(suman.length, filas.length));
            if (!c.moneda) return '';
            return (suman.reduce((t: number, f) => t + Number(c.valor(f)), 0) / 100).toFixed(2).replace('.', ',');
          })
          .join(';'),
      );
    }

    return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
  }
}

/** Deja claro cuándo el total no incluye todas las filas, como pasa con los cobros anulados. */
function rotuloDeTotal(suman: number, filas: number): string {
  return suman === filas ? `Total (${filas})` : `Total (${suman} de ${filas})`;
}

/** Excel no acepta más de 31 caracteres ni algunos símbolos en el nombre de la hoja. */
function nombreDeHoja(titulo: string): string {
  return titulo.replace(/[*?:\\/[\]]/g, '-').slice(0, 31);
}
