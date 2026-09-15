import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  parcelaActualizarSchema,
  parcelaCrearSchema,
  parcelaListarSchema,
  type ParcelaActualizar,
  type ParcelaCrear,
  type ParcelaListar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { ParcelasService } from './parcelas.service';

@Controller('parcelas')
export class ParcelasController {
  constructor(private readonly parcelas: ParcelasService) {}

  @Get()
  listar(@Query(new ZodPipe(parcelaListarSchema)) query: ParcelaListar) {
    return this.parcelas.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.parcelas.obtener(id);
  }

  @Post()
  crear(@Body(new ZodPipe(parcelaCrearSchema)) body: ParcelaCrear) {
    return this.parcelas.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(parcelaActualizarSchema)) body: ParcelaActualizar) {
    return this.parcelas.actualizar(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.parcelas.eliminar(id);
  }
}
