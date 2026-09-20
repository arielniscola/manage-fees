import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { loteoActualizarSchema, loteoCrearSchema, type LoteoActualizar, type LoteoCrear } from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { LoteosService } from './loteos.service';

@Controller('loteos')
export class LoteosController {
  constructor(private readonly loteos: LoteosService) {}

  @Get()
  listar() {
    return this.loteos.listar();
  }

  @Post()
  crear(@Body(new ZodPipe(loteoCrearSchema)) body: LoteoCrear) {
    return this.loteos.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(loteoActualizarSchema)) body: LoteoActualizar) {
    return this.loteos.actualizar(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.loteos.eliminar(id);
  }
}
