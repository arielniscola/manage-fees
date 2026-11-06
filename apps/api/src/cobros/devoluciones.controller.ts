import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import {
  devolucionAnularSchema,
  devolucionCrearSchema,
  devolucionListarSchema,
  motivoDevolucionActualizarSchema,
  motivoDevolucionSchema,
  type DevolucionAnular,
  type DevolucionCrear,
  type DevolucionListar,
  type MotivoDevolucionActualizar,
  type MotivoDevolucionDatos,
  type UsuarioSesion,
} from '@mf/shared';
import type { Response } from 'express';
import { UsuarioActual } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DevolucionesService } from './devoluciones.service';
import { MotivosDevolucionService } from './motivos-devolucion.service';

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  @Get()
  listar(@Query(new ZodPipe(devolucionListarSchema)) query: DevolucionListar) {
    return this.devoluciones.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.devoluciones.obtener(id);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ZodPipe(devolucionAnularSchema)) body: DevolucionAnular,
  ) {
    return this.devoluciones.anular(id, usuario, body);
  }

  /** El comprobante en PDF. Sin `descargar` se abre en el visor del navegador. */
  @Get(':id/comprobante.pdf')
  async comprobante(
    @Param('id', ParseIntPipe) id: number,
    @Query('descargar') descargar: string | undefined,
    @Res() res: Response,
  ) {
    const { nombre, pdf } = await this.devoluciones.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`);
    res.end(pdf);
  }
}

/** Se devuelve un cobro entero, así que la devolución nace desde el cobro. */
@Controller('cobros/:cobroId/devolucion')
export class DevolucionDeCobroController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  @Post()
  registrar(
    @Param('cobroId', ParseIntPipe) cobroId: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ZodPipe(devolucionCrearSchema)) body: DevolucionCrear,
  ) {
    return this.devoluciones.registrar(cobroId, usuario, body);
  }
}

/** La lista de motivos; se administra desde la misma vista de devoluciones. */
@Controller('motivos-devolucion')
export class MotivosDevolucionController {
  constructor(private readonly motivos: MotivosDevolucionService) {}

  @Get()
  listar() {
    return this.motivos.listar();
  }

  @Post()
  crear(@Body(new ZodPipe(motivoDevolucionSchema)) body: MotivoDevolucionDatos) {
    return this.motivos.crear(body);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(motivoDevolucionActualizarSchema)) body: MotivoDevolucionActualizar,
  ) {
    return this.motivos.actualizar(id, body);
  }
}
