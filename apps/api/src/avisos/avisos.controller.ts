import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import {
  avisoPruebaSchema,
  configuracionAvisosSchema,
  ejecutarAvisosSchema,
  envioListarSchema,
  type AvisoPrueba,
  type ConfiguracionAvisos,
  type EjecutarAvisos,
  type EnvioListar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AvisosService } from './avisos.service';
import { EnviosService } from './envios.service';

@Controller('avisos')
export class AvisosController {
  constructor(
    private readonly avisos: AvisosService,
    private readonly envios: EnviosService,
  ) {}

  @Get('configuracion')
  configuracion() {
    return this.avisos.configuracion();
  }

  @Put('configuracion')
  guardar(@Body(new ZodPipe(configuracionAvisosSchema)) body: ConfiguracionAvisos) {
    return this.avisos.guardarConfiguracion(body);
  }

  /** Con `simular` en true devuelve a quién le tocaría el aviso, sin mandar nada. */
  @Post('ejecutar')
  @HttpCode(200)
  ejecutar(@Body(new ZodPipe(ejecutarAvisosSchema)) body: EjecutarAvisos) {
    return this.avisos.ejecutar(body);
  }

  /** Correo de muestra con datos inventados, para probar el SMTP y ver cómo queda el texto. */
  @Post('probar')
  @HttpCode(204)
  probar(@Body(new ZodPipe(avisoPruebaSchema)) body: AvisoPrueba) {
    return this.avisos.probar(body);
  }

  @Get('envios')
  envios_(@Query(new ZodPipe(envioListarSchema)) query: EnvioListar) {
    return this.envios.listar(query);
  }
}
