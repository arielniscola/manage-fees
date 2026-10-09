import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  cuotaAnularSchema,
  cuotaListarSchema,
  generarCuotasSchema,
  loteAnularSchema,
  loteSchema,
  tarifaActualizarSchema,
  tarifaCrearSchema,
  tarifaListarSchema,
  type CuotaAnular,
  type CuotaListar,
  type GenerarCuotas,
  type Lote,
  type LoteAnular,
  type TarifaActualizar,
  type TarifaCrear,
  type TarifaListar,
} from '@mf/shared';
import { enLote } from '../common/lote';
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

  @Post(':id/desactivar')
  @HttpCode(200)
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.tarifas.desactivar(id);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.tarifas.reactivar(id);
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

  /** Anula varias con el mismo motivo: las pagadas, refinanciadas o ya anuladas se saltean. */
  @Post('anular')
  @HttpCode(200)
  anularLote(@Body(new ZodPipe(loteAnularSchema)) { ids, motivo }: LoteAnular) {
    return enLote(ids, (id) => this.cuotas.anular(id, { motivo }));
  }

  /** Borra cuotas ya anuladas. Las que no lo están se saltean. */
  @Post('eliminar')
  @HttpCode(200)
  eliminarLote(@Body(new ZodPipe(loteSchema)) { ids }: Lote) {
    return enLote(ids, (id) => this.cuotas.eliminar(id));
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(cuotaAnularSchema)) body: CuotaAnular) {
    return this.cuotas.anular(id, body);
  }
}
