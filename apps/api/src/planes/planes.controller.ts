import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  planCancelarSchema,
  planCrearSchema,
  planListarSchema,
  type PlanCancelar,
  type PlanCrear,
  type PlanListar,
  type UsuarioSesion,
} from '@mf/shared';
import { UsuarioActual } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PlanesService } from './planes.service';

@Controller('planes')
export class PlanesController {
  constructor(private readonly planes: PlanesService) {}

  @Get()
  listar(@Query(new ZodPipe(planListarSchema)) query: PlanListar) {
    return this.planes.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.planes.obtener(id);
  }

  @Post()
  crear(@UsuarioActual() usuario: UsuarioSesion, @Body(new ZodPipe(planCrearSchema)) body: PlanCrear) {
    return this.planes.crear(usuario, body);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ZodPipe(planCancelarSchema)) body: PlanCancelar,
  ) {
    return this.planes.cancelar(id, usuario, body);
  }
}

/** Planes de un socio, sin paginar: la ficha los muestra completos. */
@Controller('socios/:socioId/planes')
export class PlanesDeSocioController {
  constructor(private readonly planes: PlanesService) {}

  @Get()
  listar(@Param('socioId', ParseIntPipe) socioId: number) {
    return this.planes.deSocio(socioId);
  }
}
