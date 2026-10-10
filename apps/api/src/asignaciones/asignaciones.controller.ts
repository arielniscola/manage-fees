import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  anticipoEntradaSchema,
  asignacionCrearSchema,
  asignacionLiberarSchema,
  type AnticipoEntrada,
  type AsignacionCrear,
  type AsignacionLiberar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AsignacionesService } from './asignaciones.service';

@Controller()
export class AsignacionesController {
  constructor(private readonly asignaciones: AsignacionesService) {}

  @Post('socios/:socioId/asignaciones')
  asignar(@Param('socioId', ParseIntPipe) socioId: number, @Body(new ZodPipe(asignacionCrearSchema)) body: AsignacionCrear) {
    return this.asignaciones.asignar(socioId, body);
  }

  @Post('asignaciones/:id/anticipo')
  cargarAnticipo(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(anticipoEntradaSchema)) body: AnticipoEntrada) {
    return this.asignaciones.cargarAnticipo(id, body);
  }

  @Post('asignaciones/:id/liberar')
  @HttpCode(200)
  liberar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(asignacionLiberarSchema)) body: AsignacionLiberar) {
    return this.asignaciones.liberar(id, body);
  }
}
