import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { cuotasDeSocioSchema, type CuotasDeSocio } from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { CuotasService } from './cuotas.service';

/**
 * Cuotas de un socio, sin paginar: la ficha las agrupa por parcela, y registrar pago o
 * armar un plan necesitan toda la deuda de una, sin toparse con el límite de página.
 */
@Controller('socios/:socioId/cuotas')
export class CuotasDeSocioController {
  constructor(private readonly cuotas: CuotasService) {}

  @Get()
  listar(
    @Param('socioId', ParseIntPipe) socioId: number,
    @Query(new ZodPipe(cuotasDeSocioSchema)) { estado }: CuotasDeSocio,
  ) {
    return this.cuotas.deSocio(socioId, estado);
  }
}
