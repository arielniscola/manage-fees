import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { CobrosController, CobrosDeSocioController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { DevolucionDeCobroController, DevolucionesController, MotivosDevolucionController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';
import { MotivosDevolucionService } from './motivos-devolucion.service';
import { RecibosService } from './recibos.service';

@Module({
  // Adelantar cuotas las crea con la misma lógica que la generación del período.
  imports: [CuotasModule],
  controllers: [CobrosController, CobrosDeSocioController, DevolucionesController, DevolucionDeCobroController, MotivosDevolucionController],
  providers: [CobrosService, RecibosService, DevolucionesService, MotivosDevolucionService],
  exports: [CobrosService, DevolucionesService],
})
export class CobrosModule {}
