import PDFDocument from 'pdfkit';
import {
  ETIQUETA_DESTINO_CUOTAS,
  ETIQUETA_MEDIO_PAGO,
  numeroDevolucion,
  numeroRecibo,
  pesos,
  type DatosDevolucion,
} from '@mf/shared';
import { fechaHoraLegible, fechaLegible } from '../common/fechas';
import {
  ANCHO,
  BORDE,
  MARGEN,
  PINO,
  TENUE,
  TINTA,
  etiqueta,
  firma,
  nuevoBuffer,
  observaciones,
  regla,
  sello,
  tabla,
  type Doc,
} from './recibo.pdf';

/**
 * Comprobante interno de devolución, con el mismo diseño que el recibo. Como el recibo,
 * se dibuja solo con el snapshot guardado al emitirlo.
 */
export function renderizarDevolucion(datos: DatosDevolucion, anulada: boolean): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    info: {
      Title: `Devolución ${numeroDevolucion(datos.numero)}`,
      Author: datos.club,
      Subject: `Devolución · ${datos.socio.apellido}, ${datos.socio.nombre}`,
      // La fecha de emisión, para que reimprimirlo dé un PDF idéntico (ver el recibo).
      CreationDate: new Date(datos.emitidoEn),
    },
  });

  const listo = nuevoBuffer(doc);
  encabezado(doc, datos);
  regla(doc, 16);
  datosDelSocio(doc, datos);
  regla(doc, 16);
  tabla(doc, datos);
  total(doc, datos);
  observaciones(doc, datos.motivo, 'Motivo de la devolución');
  firma(doc);
  pie(doc, datos);
  if (anulada) sello(doc, 'ANULADA');
  doc.end();
  return listo;
}

function encabezado(doc: Doc, datos: DatosDevolucion) {
  const y = doc.y;
  const anchoCaja = 168;
  const xCaja = MARGEN + ANCHO - anchoCaja;

  doc.font('Helvetica-Bold').fontSize(17).fillColor(PINO).text(datos.club, MARGEN, y, { width: ANCHO - anchoCaja - 16 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(TENUE)
    .text(
      `Comprobante de devolución del recibo N° ${numeroRecibo(datos.recibo.numero)} del ${fechaLegible(datos.recibo.fecha)} · comprobante interno, no válido como factura`,
      MARGEN,
      doc.y + 3,
      { width: ANCHO - anchoCaja - 16 },
    );
  const finTexto = doc.y;

  doc.roundedRect(xCaja, y - 4, anchoCaja, 62, 4).lineWidth(1).strokeColor(BORDE).stroke();
  etiqueta(doc, 'Devolución N°', xCaja, y + 6, anchoCaja - 14, 'right');
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(TINTA)
    .text(numeroDevolucion(datos.numero), xCaja, y + 18, { width: anchoCaja - 14, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(TENUE)
    .text(fechaLegible(datos.fecha), xCaja, y + 38, { width: anchoCaja - 14, align: 'right' });

  doc.y = Math.max(finTexto, y + 58);
}

function datosDelSocio(doc: Doc, datos: DatosDevolucion) {
  const y = doc.y;
  const ancho = (ANCHO - 56) / 3;
  const columnas: [string, string][][] = [
    [
      ['Devuelto a', `${datos.socio.nombre} ${datos.socio.apellido}`],
      ['Socio N°', String(datos.socio.numero)],
    ],
    [
      ['DNI', datos.socio.dni],
      ['Cuotas', ETIQUETA_DESTINO_CUOTAS[datos.destinoCuotas]],
    ],
    [
      ['Medio de devolución', ETIQUETA_MEDIO_PAGO[datos.medio]],
      ['Registró', datos.registradoPor],
    ],
  ];

  let maximo = y;
  columnas.forEach((celdas, i) => {
    const x = MARGEN + i * (ancho + 28);
    let cursor = y;
    for (const [nombre, valor] of celdas) {
      etiqueta(doc, nombre, x, cursor, ancho);
      doc.font('Helvetica').fontSize(10).fillColor(TINTA).text(valor, x, cursor + 9, { width: ancho });
      cursor = doc.y + 7;
    }
    maximo = Math.max(maximo, cursor);
  });

  doc.y = maximo - 7;
}

function total(doc: Doc, datos: DatosDevolucion) {
  const y = doc.y + 14;
  etiqueta(doc, 'Total devuelto', MARGEN, y + 6, ANCHO - 150, 'right');
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(TINTA)
    .text(pesos(datos.total), MARGEN + ANCHO - 140, y, { width: 140, align: 'right' });
  doc.y = y + 24;
}

function pie(doc: Doc, datos: DatosDevolucion) {
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(TENUE)
    .text(`Emitido el ${fechaHoraLegible(datos.emitidoEn)} · Devolución ${numeroDevolucion(datos.numero)}`, MARGEN, 788, {
      width: ANCHO,
      align: 'center',
    });
}
