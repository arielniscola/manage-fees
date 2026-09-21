import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  configuracionAdelantoSchema,
  configuracionInteresSchema,
  type ConfiguracionAdelantoGuardar,
  type ConfiguracionInteresGuardar,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AdelantoService } from './adelanto.service';
import { InteresService } from './interes.service';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(
    private readonly interes: InteresService,
    private readonly adelanto: AdelantoService,
  ) {}

  @Get('interes')
  interesVigente() {
    return this.interes.obtener();
  }

  @Put('interes')
  guardarInteres(@Body(new ZodPipe(configuracionInteresSchema)) body: ConfiguracionInteresGuardar) {
    return this.interes.guardar(body);
  }

  @Get('adelanto')
  adelantoVigente() {
    return this.adelanto.obtener();
  }

  @Put('adelanto')
  guardarAdelanto(@Body(new ZodPipe(configuracionAdelantoSchema)) body: ConfiguracionAdelantoGuardar) {
    return this.adelanto.guardar(body);
  }
}
