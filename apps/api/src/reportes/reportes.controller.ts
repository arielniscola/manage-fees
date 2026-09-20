import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { TIPOS_REPORTE, panelSchema, reporteSchema, type PanelConsulta, type ReporteConsulta, type TipoReporte } from '@mf/shared';
import type { Response } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { ExportacionService } from './exportacion.service';
import { PanelService } from './panel.service';

@Controller()
export class ReportesController {
  constructor(
    private readonly panel: PanelService,
    private readonly exportacion: ExportacionService,
  ) {}

  @Get('panel')
  resumen(@Query(new ZodPipe(panelSchema)) query: PanelConsulta) {
    return this.panel.resumen(query);
  }

  /** Descarga el reporte en Excel o CSV. */
  @Get('reportes/:tipo')
  async exportar(
    @Param('tipo') tipo: string,
    @Query(new ZodPipe(reporteSchema)) { desde, hasta, formato, loteoId }: ReporteConsulta,
    @Res() res: Response,
  ) {
    if (!TIPOS_REPORTE.includes(tipo as TipoReporte)) {
      throw new BadRequestException({ statusCode: 400, message: 'No existe ese reporte', field: 'tipo' });
    }

    const { nombre, contenido, tipoMime } = await this.exportacion.generar(
      tipo as TipoReporte,
      { desde, hasta, loteoId },
      formato,
    );
    res.setHeader('Content-Type', tipoMime);
    res.setHeader('Content-Length', contenido.length);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.end(contenido);
  }
}
