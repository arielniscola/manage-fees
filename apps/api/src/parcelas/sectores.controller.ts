import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  sectorActualizarSchema,
  sectorCrearSchema,
  sectorListarSchema,
  type SectorActualizar,
  type SectorCrear,
  type SectorListar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SectoresService } from './sectores.service';

@Controller('sectores')
export class SectoresController {
  constructor(private readonly sectores: SectoresService) {}

  @Get()
  listar(@Query(new ZodPipe(sectorListarSchema)) query: SectorListar) {
    return this.sectores.listar(query);
  }

  @Post()
  crear(@Body(new ZodPipe(sectorCrearSchema)) body: SectorCrear) {
    return this.sectores.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(sectorActualizarSchema)) body: SectorActualizar) {
    return this.sectores.actualizar(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.sectores.eliminar(id);
  }
}
