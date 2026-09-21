import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { adelantoPrevioSchema, cuotasDeSocioSchema, type AdelantoPrevio, type CuotasDeSocio } from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AdelantosService } from './adelantos.service';
import { CuotasService } from './cuotas.service';

/**
 * Cuotas de un socio, sin paginar: la ficha las agrupa por parcela, y registrar pago o
 * armar un plan necesitan toda la deuda de una, sin toparse con el límite de página.
 */
@Controller('socios/:socioId/cuotas')
export class CuotasDeSocioController {
  constructor(
    private readonly cuotas: CuotasService,
    private readonly adelantos: AdelantosService,
  ) {}

  @Get()
  listar(
    @Param('socioId', ParseIntPipe) socioId: number,
    @Query(new ZodPipe(cuotasDeSocioSchema)) { estado }: CuotasDeSocio,
  ) {
    return this.cuotas.deSocio(socioId, estado);
  }

  /**
   * Vista previa del adelanto: qué cuotas futuras habría que crear para que el socio
   * quede pago hasta ese mes, y cuánto saldría. No escribe nada; las cuotas se crean
   * recién al registrar el cobro.
   */
  @Get('adelanto')
  adelanto(
    @Param('socioId', ParseIntPipe) socioId: number,
    @Query(new ZodPipe(adelantoPrevioSchema)) { hasta }: AdelantoPrevio,
  ) {
    return this.adelantos.previsualizar(socioId, hasta);
  }
}
