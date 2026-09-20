import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  cuotaAnularSchema,
  cuotaListarSchema,
  generarCuotasSchema,
  tarifaActualizarSchema,
  tarifaCrearSchema,
  tarifaListarSchema,
  type CuotaAnular,
  type CuotaListar,
  type GenerarCuotas,
  type TarifaActualizar,
  type TarifaCrear,
  type TarifaListar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { CuotasService } from './cuotas.service';
import { GeneracionService } from './generacion.service';
import { TarifasService } from './tarifas.service';

@Controller('tarifas')
export class TarifasController {
  constructor(private readonly tarifas: TarifasService) {}

  @Get()
  listar(@Query(new ZodPipe(tarifaListarSchema)) query: TarifaListar) {
    return this.tarifas.listar(query);
  }

  @Post()
  crear(@Body(new ZodPipe(tarifaCrearSchema)) body: TarifaCrear) {
    return this.tarifas.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(tarifaActualizarSchema)) body: TarifaActualizar) {
    return this.tarifas.actualizar(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.tarifas.eliminar(id);
  }
}

@Controller('cuotas')
export class CuotasController {
  constructor(
    private readonly cuotas: CuotasService,
    private readonly generacion: GeneracionService,
  ) {}

  @Get()
  listar(@Query(new ZodPipe(cuotaListarSchema)) query: CuotaListar) {
    return this.cuotas.listar(query);
  }

  /** Con `simular` en true devuelve la vista previa sin escribir nada. */
  @Post('generar')
  @HttpCode(200)
  generar(@Body(new ZodPipe(generarCuotasSchema)) body: GenerarCuotas) {
    return this.generacion.generar(body);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(cuotaAnularSchema)) body: CuotaAnular) {
    return this.cuotas.anular(id, body);
  }
}
