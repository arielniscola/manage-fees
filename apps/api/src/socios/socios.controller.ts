import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  loteSchema,
  socioActualizarSchema,
  socioBajaSchema,
  socioCrearSchema,
  socioListarSchema,
  type Lote,
  type SocioActualizar,
  type SocioBaja,
  type SocioCrear,
  type SocioListar,
} from '@mf/shared';
import { enLote } from '../common/lote';
import { ZodPipe } from '../common/zod.pipe';
import { SociosService } from './socios.service';

@Controller('socios')
export class SociosController {
  constructor(private readonly socios: SociosService) {}

  @Get()
  listar(@Query(new ZodPipe(socioListarSchema)) query: SocioListar) {
    return this.socios.listar(query);
  }

  /** Elimina varios a la vez: los que no se pueden borrar se saltean y se informan. */
  @Post('eliminar')
  @HttpCode(200)
  eliminarLote(@Body(new ZodPipe(loteSchema)) { ids }: Lote) {
    return enLote(ids, (id) => this.socios.eliminar(id));
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

  /** Borra al socio por completo. Solo se puede si no dejó movimientos que conservar. */
  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.socios.eliminar(id);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.socios.reactivar(id);
  }
}
