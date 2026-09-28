import { Module } from '@nestjs/common';
import { ImportacionParcelasController } from './importacion-parcelas.controller';
import { ImportacionParcelasService } from './importacion-parcelas.service';
import { ParcelasController } from './parcelas.controller';
import { LoteosController } from './loteos.controller';
import { LoteosService } from './loteos.service';
import { SectoresController } from './sectores.controller';
import { SectoresService } from './sectores.service';
import { ParcelasService } from './parcelas.service';

@Module({
  // La importación va antes: sus rutas cuelgan de /parcelas y no deben caer en /parcelas/:id.
  controllers: [ImportacionParcelasController, ParcelasController, SectoresController, LoteosController],
  providers: [ParcelasService, SectoresService, LoteosService, ImportacionParcelasService],
})
export class ParcelasModule {}
