import { Global, Module } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { InteresService } from './interes.service';

/**
 * Global: el interés por mora lo consultan cuotas, socios, cobros, planes y reportes,
 * y no tiene sentido que cada módulo lo importe por separado.
 */
@Global()
@Module({
  controllers: [ConfiguracionController],
  providers: [InteresService],
  exports: [InteresService],
})
export class ConfiguracionModule {}
