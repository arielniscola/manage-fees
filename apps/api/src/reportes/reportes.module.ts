import { Module } from '@nestjs/common';
import { CobrosModule } from '../cobros/cobros.module';
import { PlanesModule } from '../planes/planes.module';
import { SociosModule } from '../socios/socios.module';
import { ConsultasService } from './consultas.service';
import { ExportacionService } from './exportacion.service';
import { PanelService } from './panel.service';
import { ReportesController } from './reportes.controller';

/** El panel y los reportes salen de las mismas consultas, y estas de los módulos de siempre. */
@Module({
  imports: [SociosModule, CobrosModule, PlanesModule],
  controllers: [ReportesController],
  providers: [ConsultasService, PanelService, ExportacionService],
})
export class ReportesModule {}
