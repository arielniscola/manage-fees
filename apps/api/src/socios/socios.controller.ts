import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  socioActualizarSchema,
  socioBajaSchema,
  socioCrearSchema,
  socioListarSchema,
  type SocioActualizar,
  type SocioBaja,
  type SocioCrear,
  type SocioListar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SociosService } from './socios.service';

@Controller('socios')
export class SociosController {
  constructor(private readonly socios: SociosService) {}

  @Get()
  listar(@Query(new ZodPipe(socioListarSchema)) query: SocioListar) {
    return this.socios.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.socios.obtener(id);
  }

  @Post()
  crear(@Body(new ZodPipe(socioCrearSchema)) body: SocioCrear) {
    return this.socios.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(socioActualizarSchema)) body: SocioActualizar) {
    return this.socios.actualizar(id, body);
  }

  @Post(':id/baja')
  @HttpCode(200)
  darDeBaja(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(socioBajaSchema)) body: SocioBaja) {
    return this.socios.darDeBaja(id, body);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.socios.reactivar(id);
  }
}
