import { Body, Controller, Get, Put } from '@nestjs/common';
import { configuracionInteresSchema, type ConfiguracionInteresGuardar } from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { InteresService } from './interes.service';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly interes: InteresService) {}

  @Get('interes')
  interesVigente() {
    return this.interes.obtener();
  }

  @Put('interes')
  guardarInteres(@Body(new ZodPipe(configuracionInteresSchema)) body: ConfiguracionInteresGuardar) {
    return this.interes.guardar(body);
  }
}
