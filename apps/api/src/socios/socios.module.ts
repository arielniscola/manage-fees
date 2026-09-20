import { Module } from '@nestjs/common';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';
import { SociosController } from './socios.controller';
import { SociosService } from './socios.service';

@Module({
  // El de importación va primero: si no, «socios/importar» lo toma «socios/:id».
  controllers: [ImportacionController, SociosController],
  providers: [SociosService, ImportacionService],
  exports: [SociosService],
})
export class SociosModule {}
