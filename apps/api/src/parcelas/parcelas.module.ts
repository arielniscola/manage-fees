import { Module } from '@nestjs/common';
import { ParcelasController } from './parcelas.controller';
import { LoteosController } from './loteos.controller';
import { LoteosService } from './loteos.service';
import { SectoresController } from './sectores.controller';
import { SectoresService } from './sectores.service';
import { ParcelasService } from './parcelas.service';

@Module({
  controllers: [ParcelasController, SectoresController, LoteosController],
  providers: [ParcelasService, SectoresService, LoteosService],
})
export class ParcelasModule {}
