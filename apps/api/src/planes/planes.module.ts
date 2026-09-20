import { Module } from '@nestjs/common';
import { PlanesController, PlanesDeSocioController } from './planes.controller';
import { PlanesService } from './planes.service';

@Module({
  controllers: [PlanesController, PlanesDeSocioController],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class PlanesModule {}
