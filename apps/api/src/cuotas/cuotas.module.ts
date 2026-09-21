import { Module } from '@nestjs/common';
import { AdelantosService } from './adelantos.service';
import { CuotasController, TarifasController } from './cuotas.controller';
import { CuotasDeSocioController } from './cuotas-de-socio.controller';
import { CuotasCron, cronActivo } from './cuotas.cron';
import { CuotasService } from './cuotas.service';
import { GeneracionService } from './generacion.service';
import { TarifasService } from './tarifas.service';

@Module({
  controllers: [TarifasController, CuotasController, CuotasDeSocioController],
  providers: [CuotasService, TarifasService, GeneracionService, AdelantosService, ...(cronActivo() ? [CuotasCron] : [])],
  exports: [GeneracionService, CuotasService, AdelantosService],
})
export class CuotasModule {}
