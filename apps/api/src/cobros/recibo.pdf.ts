import PDFDocument from 'pdfkit';
import { ETIQUETA_MEDIO_PAGO, numeroRecibo, pesos, type DatosRecibo } from '@mf/shared';
import { fechaHoraLegible, fechaLegible } from '../common/fechas';

/**
 * Recibo interno, no fiscal. Se dibuja exclusivamente con el snapshot guardado al emitirlo,
 * así reimprimirlo dentro de un año devuelve exactamente el mismo comprobante.
 *
 * Se usa pdfkit y no @react-pdf/renderer (como decía el plan) porque este último depende de
 * @react-pdf/hyphenate, que solo publica ESM y no se puede cargar desde el build CJS de la API.
 */

const PINO = '#2B5337';
const TINTA = '#22251F';
const TENUE = '#6D6A5F';
const BORDE = '#E2DACB';
const FONDO = '#FAF6EE';
const MOR = '#A63D2A';

const MARGEN = 44;
const ANCHO_PAGINA = 595.28;
const ANCHO = ANCHO_PAGINA - MARGEN * 2;

const COL_PARCELA = 72;
const COL_VENCE = 78;
const COL_IMPORTE = 88;
const COL_CONCEPTO = ANCHO - COL_PARCELA - COL_VENCE - COL_IMPORTE;

type Doc = InstanceType<typeof PDFDocument>;

export function renderizarRecibo(datos: DatosRecibo, anulado: boolean): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    info: {
      Title: `Recibo ${numeroRecibo(datos.numero)}`,
      Author: datos.club,
      Subject: `Cuota social · ${datos.socio.apellido}, ${datos.socio.nombre}`,
      // La fecha de emisión, no la de impresión: pdfkit deriva de acá el identificador
      // del archivo, así que reimprimir el recibo devuelve un PDF byte a byte idéntico.
      CreationDate: new Date(datos.emitidoEn),
    },
  });

  const listo = nuevoBuffer(doc);
  dibujar(doc, datos, anulado);
  doc.end();
  return listo;
}

function nuevoBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
}

function dibujar(doc: Doc, datos: DatosRecibo, anulado: boolean) {
  encabezado(doc, datos);
  regla(doc, 16);
  datosDelSocio(doc, datos);
  regla(doc, 16);
  tabla(doc, datos);
  total(doc, datos);
  if (datos.observaciones) observaciones(doc, datos.observaciones);
  firma(doc);
  pie(doc, datos);
  // Al final, para que quede por encima de todo lo demás.
  if (anulado) sello(doc);
}

function encabezado(doc: Doc, datos: DatosRecibo) {
  const y = doc.y;
  const anchoCaja = 168;
  const xCaja = MARGEN + ANCHO - anchoCaja;

  doc.font('Helvetica-Bold').fontSize(17).fillColor(PINO).text(datos.club, MARGEN, y, { width: ANCHO - anchoCaja - 16 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(TENUE)
    .text('Recibo de cuota social · comprobante interno, no válido como factura', MARGEN, doc.y + 3, {
      width: ANCHO - anchoCaja - 16,
    });
  const finTexto = doc.y;

  doc.roundedRect(xCaja, y - 4, anchoCaja, 62, 4).lineWidth(1).strokeColor(BORDE).stroke();
  etiqueta(doc, 'Recibo N°', xCaja, y + 6, anchoCaja - 14, 'right');
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(TINTA)
    .text(numeroRecibo(datos.numero), xCaja, y + 18, { width: anchoCaja - 14, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(TENUE)
    .text(fechaLegible(datos.fecha), xCaja, y + 38, { width: anchoCaja - 14, align: 'right' });

  doc.y = Math.max(finTexto, y + 58);
}

function datosDelSocio(doc: Doc, datos: DatosRecibo) {
  const y = doc.y;
  const ancho = (ANCHO - 56) / 3;
  const columnas: [string, string][][] = [
    [
      ['Recibí de', `${datos.socio.nombre} ${datos.socio.apellido}`],
      ['Socio N°', String(datos.socio.numero)],
    ],
    [
      ['DNI', datos.socio.dni],
      ['Domicilio', datos.socio.direccion || '—'],
    ],
    [
      ['Medio de pago', ETIQUETA_MEDIO_PAGO[datos.medio]],
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

function tabla(doc: Doc, datos: DatosRecibo) {
  const alturaCabecera = 20;
  let y = doc.y;

  doc.rect(MARGEN, y, ANCHO, alturaCabecera).fill(FONDO);
  doc.rect(MARGEN, y, ANCHO, alturaCabecera).lineWidth(1).strokeColor(BORDE).stroke();
  const yTexto = y + 6.5;
  etiqueta(doc, 'Concepto', MARGEN + 8, yTexto, COL_CONCEPTO);
  etiqueta(doc, 'Parcela', MARGEN + 8 + COL_CONCEPTO, yTexto, COL_PARCELA);
  etiqueta(doc, 'Vencimiento', MARGEN + 8 + COL_CONCEPTO + COL_PARCELA, yTexto, COL_VENCE);
  etiqueta(doc, 'Importe', MARGEN + COL_CONCEPTO + COL_PARCELA + COL_VENCE, yTexto, COL_IMPORTE - 8, 'right');
  y += alturaCabecera;

  doc.font('Helvetica').fontSize(10).fillColor(TINTA);
  for (const d of datos.detalles) {
    const alto = 21;
    // Ni el interés por mora ni el descuento por adelantar son un renglón aparte: viajan
    // dentro del importe de su cuota, y se aclaran al lado del concepto para que el socio
    // vea de dónde sale la diferencia.
    const aclaracion = d.interes
      ? ` (incluye ${pesos(d.interes)} de interés)`
      : d.descuento
        ? ` (con ${pesos(d.descuento)} de descuento)`
        : '';
    const concepto = `${d.concepto}${aclaracion}`;
    doc.text(concepto, MARGEN + 8, y + 6, { width: COL_CONCEPTO - 8, lineBreak: false, ellipsis: true });
    doc.text(d.parcela, MARGEN + 8 + COL_CONCEPTO, y + 6, { width: COL_PARCELA - 8, lineBreak: false });
    doc.text(fechaLegible(d.vencimiento), MARGEN + 8 + COL_CONCEPTO + COL_PARCELA, y + 6, { width: COL_VENCE - 8, lineBreak: false });
    doc.text(pesos(d.importe), MARGEN + COL_CONCEPTO + COL_PARCELA + COL_VENCE, y + 6, {
      width: COL_IMPORTE - 8,
      align: 'right',
      lineBreak: false,
    });
    y += alto;
    doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(1).strokeColor(BORDE).stroke();
  }

  doc.y = y;
}

function total(doc: Doc, datos: DatosRecibo) {
  const y = doc.y + 14;
  etiqueta(doc, 'Total recibido', MARGEN, y + 6, ANCHO - 150, 'right');
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(TINTA)
    .text(pesos(datos.total), MARGEN + ANCHO - 140, y, { width: 140, align: 'right' });
  doc.y = y + 24;
}

function observaciones(doc: Doc, texto: string) {
  const y = doc.y + 16;
  const alto = doc.font('Helvetica').fontSize(10).heightOfString(texto, { width: ANCHO - 20 }) + 26;
  doc.roundedRect(MARGEN, y, ANCHO, alto, 4).lineWidth(1).strokeColor(BORDE).stroke();
  etiqueta(doc, 'Observaciones', MARGEN + 10, y + 8, ANCHO - 20);
  doc.font('Helvetica').fontSize(10).fillColor(TINTA).text(texto, MARGEN + 10, y + 18, { width: ANCHO - 20 });
  doc.y = y + alto;
}

function firma(doc: Doc) {
  const y = Math.min(doc.y + 52, 700);
  const ancho = 200;
  const x = MARGEN + ANCHO - ancho;
  doc.moveTo(x, y).lineTo(x + ancho, y).lineWidth(1).strokeColor(BORDE).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(TENUE).text('Firma y sello', x, y + 5, { width: ancho, align: 'center' });
}

function pie(doc: Doc, datos: DatosRecibo) {
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(TENUE)
    .text(`Emitido el ${fechaHoraLegible(datos.emitidoEn)} · Recibo ${numeroRecibo(datos.numero)}`, MARGEN, 788, {
      width: ANCHO,
      align: 'center',
    });
}

/** Marca de agua en diagonal para un recibo anulado. */
function sello(doc: Doc) {
  doc.save();
  doc.rotate(-22, { origin: [ANCHO_PAGINA / 2, 400] });
  doc.opacity(0.16).font('Helvetica-Bold').fontSize(64).fillColor(MOR);
  doc.text('ANULADO', 0, 370, { width: ANCHO_PAGINA, align: 'center' });
  doc.restore();
  doc.opacity(1);
}

function regla(doc: Doc, separacion: number) {
  const y = doc.y + separacion;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(1).strokeColor(BORDE).stroke();
  doc.y = y + separacion;
}

function etiqueta(doc: Doc, texto: string, x: number, y: number, ancho: number, align: 'left' | 'right' = 'left') {
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(TENUE)
    .text(texto.toUpperCase(), x, y, { width: ancho, align, characterSpacing: 0.8, lineBreak: false });
}
