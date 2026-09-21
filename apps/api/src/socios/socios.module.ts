import { Module } from '@nestjs/common';
import { HistorialController, HistorialDeSocioController } from './historial.controller';
import { HistorialService } from './historial.service';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';
import { SociosController } from './socios.controller';
import { SociosService } from './socios.service';

@Module({
  // Los de rutas fijas van primero: si no, «socios/importar» y «socios/historial» los
  // toma «socios/:id».
  controllers: [ImportacionController, HistorialController, HistorialDeSocioController, SociosController],
  providers: [SociosService, ImportacionService, HistorialService],
  exports: [SociosService],
})
export class SociosModule {}
