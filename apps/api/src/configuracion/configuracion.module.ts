import { Global, Module } from '@nestjs/common';
import { AdelantoService } from './adelanto.service';
import { ConfiguracionController } from './configuracion.controller';
import { InteresService } from './interes.service';

/**
 * Global: el interés por mora lo consultan cuotas, cobros y planes,
 * y las reglas del adelanto las necesitan cuotas y cobros; no tiene sentido que cada
 * módulo las importe por separado.
 */
@Global()
@Module({
  controllers: [ConfiguracionController],
  providers: [InteresService, AdelantoService],
  exports: [InteresService, AdelantoService],
})
export class ConfiguracionModule {}
