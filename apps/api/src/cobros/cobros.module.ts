import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { CobrosController, CobrosDeSocioController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { RecibosService } from './recibos.service';

@Module({
  // Adelantar cuotas las crea con la misma lógica que la generación del período.
  imports: [CuotasModule],
  controllers: [CobrosController, CobrosDeSocioController],
  providers: [CobrosService, RecibosService],
  exports: [CobrosService],
})
export class CobrosModule {}
