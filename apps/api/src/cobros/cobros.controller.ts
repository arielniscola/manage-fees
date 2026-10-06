import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import {
  cobroAnularSchema,
  cobroCrearSchema,
  cobroListarSchema,
  loteAnularSchema,
  loteSchema,
  type CobroAnular,
  type CobroCrear,
  type CobroListar,
  type Lote,
  type LoteAnular,
  type UsuarioSesion,
} from '@mf/shared';
import type { Response } from 'express';
import { UsuarioActual } from '../auth/decorators';
import { enLote } from '../common/lote';
import { ZodPipe } from '../common/zod.pipe';
import { CobrosService } from './cobros.service';
import { RecibosService } from './recibos.service';

@Controller('cobros')
export class CobrosController {
  constructor(
    private readonly cobros: CobrosService,
    private readonly recibos: RecibosService,
  ) {}

  @Get()
  listar(@Query(new ZodPipe(cobroListarSchema)) query: CobroListar) {
    return this.cobros.listar(query);
  }

  /** Anula varios con el mismo motivo: los ya anulados se saltean. */
  @Post('anular')
  @HttpCode(200)
  anularLote(@UsuarioActual() usuario: UsuarioSesion, @Body(new ZodPipe(loteAnularSchema)) { ids, motivo }: LoteAnular) {
    return enLote(ids, (id) => this.cobros.anular(id, usuario, { motivo }));
  }

  /** Borra cobros ya anulados, con su recibo. Los vigentes se saltean. */
  @Post('eliminar')
  @HttpCode(200)
  eliminarLote(@Body(new ZodPipe(loteSchema)) { ids }: Lote) {
    return enLote(ids, (id) => this.cobros.eliminar(id));
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.cobros.obtener(id);
  }

  @Post()
  registrar(@UsuarioActual() usuario: UsuarioSesion, @Body(new ZodPipe(cobroCrearSchema)) body: CobroCrear) {
    return this.cobros.registrar(usuario, body);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ZodPipe(cobroAnularSchema)) body: CobroAnular,
  ) {
    return this.cobros.anular(id, usuario, body);
  }

  /** El recibo en PDF. Sin `descargar` se abre en el visor del navegador, listo para imprimir. */
  @Get(':id/recibo.pdf')
  async recibo(
    @Param('id', ParseIntPipe) id: number,
    @Query('descargar') descargar: string | undefined,
    @Res() res: Response,
  ) {
    const { nombre, pdf } = await this.recibos.pdfDeCobro(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`);
    res.end(pdf);
  }
}

/** Historial de pagos de un socio, sin paginar: la ficha los muestra completos. */
@Controller('socios/:socioId/cobros')
export class CobrosDeSocioController {
  constructor(private readonly cobros: CobrosService) {}

  @Get()
  listar(@Param('socioId', ParseIntPipe) socioId: number) {
    return this.cobros.deSocio(socioId);
  }
}
