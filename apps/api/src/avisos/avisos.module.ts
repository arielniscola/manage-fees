import { Module } from '@nestjs/common';
import { AvisosController } from './avisos.controller';
import { AvisosCron, cronActivo } from './avisos.cron';
import { AvisosService } from './avisos.service';
import { CorreoService } from './correo.service';
import { EnviosService } from './envios.service';

@Module({
  controllers: [AvisosController],
  providers: [AvisosService, EnviosService, CorreoService, ...(cronActivo() ? [AvisosCron] : [])],
})
export class AvisosModule {}
