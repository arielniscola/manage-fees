import { Injectable } from '@nestjs/common';
import { numeroRecibo, type DatosRecibo } from '@mf/shared';
import { noEncontrado } from '../common/errores';
import { PrismaService } from '../prisma/prisma.module';
import { renderizarRecibo } from './recibo.pdf';

@Injectable()
export class RecibosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Arma el PDF del recibo de un cobro. Se construye siempre con el snapshot guardado al
   * emitirlo, así reimprimirlo devuelve exactamente el mismo comprobante.
   */
  async pdfDeCobro(cobroId: number): Promise<{ nombre: string; pdf: Buffer }> {
    const recibo = await this.prisma.recibo.findUnique({ where: { cobroId } });
    if (!recibo) throw noEncontrado('El cobro no tiene recibo emitido');

    const datos = recibo.datos as unknown as DatosRecibo;
    return {
      nombre: `recibo-${numeroRecibo(recibo.numero)}.pdf`,
      pdf: await renderizarRecibo(datos, recibo.anulado),
    };
  }
}
