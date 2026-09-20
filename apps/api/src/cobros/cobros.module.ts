import { Module } from '@nestjs/common';
import { CobrosController, CobrosDeSocioController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { RecibosService } from './recibos.service';

@Module({
  controllers: [CobrosController, CobrosDeSocioController],
  providers: [CobrosService, RecibosService],
  exports: [CobrosService],
})
export class CobrosModule {}
