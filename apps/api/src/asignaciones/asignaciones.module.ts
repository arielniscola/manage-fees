import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { PlanesModule } from '../planes/planes.module';
import { AsignacionesController } from './asignaciones.controller';
import { TransferenciasController } from './transferencias.controller';
import { TransferenciasService } from './transferencias.service';
import { AsignacionesService } from './asignaciones.service';

@Module({
  // Transferir una parcela con deuda firma un plan de pago en el mismo movimiento.
  imports: [CuotasModule, PlanesModule],
  controllers: [AsignacionesController, TransferenciasController],
  providers: [AsignacionesService, TransferenciasService],
})
export class AsignacionesModule {}
