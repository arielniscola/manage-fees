import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  fechaSchema,
  hoy,
  transferenciaCrearSchema,
  transferenciaListarSchema,
  type TransferenciaCrear,
  type TransferenciaListar,
  type UsuarioSesion,
} from '@mf/shared';
import { UsuarioActual } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { TransferenciasService } from './transferencias.service';

@Controller()
export class TransferenciasController {
  constructor(private readonly transferencias: TransferenciasService) {}

  @Get('transferencias')
  listar(@Query(new ZodPipe(transferenciaListarSchema)) query: TransferenciaListar) {
    return this.transferencias.listar(query);
  }

  /**
   * Qué debe la parcela al día de la transferencia. Es lo que hay que refinanciar antes
   * de entregarla, porque son cuotas que quedan con el titular que sale.
   */
  @Get('parcelas/:parcelaId/transferencia/deuda')
  deuda(@Param('parcelaId', ParseIntPipe) parcelaId: number, @Query('fecha') fecha?: string) {
    return this.transferencias.deuda(parcelaId, fechaSchema.default(hoy).parse(fecha));
  }

  /** Pasa la parcela del titular actual a otro socio y deja el registro. */
  @Post('parcelas/:parcelaId/transferir')
  transferir(
    @Param('parcelaId', ParseIntPipe) parcelaId: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ZodPipe(transferenciaCrearSchema)) body: TransferenciaCrear,
  ) {
    return this.transferencias.transferir(parcelaId, usuario, body);
  }

  @Get('socios/:socioId/transferencias')
  deSocio(@Param('socioId', ParseIntPipe) socioId: number) {
    return this.transferencias.deSocio(socioId);
  }
}
