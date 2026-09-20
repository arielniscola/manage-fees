import { Injectable } from '@nestjs/common';
import { etiquetaPeriodo, hoy, mesDe, sumarMeses, type Panel, type PanelConsulta } from '@mf/shared';
import { ConsultasService } from './consultas.service';

const TOP_MOROSOS = 5;

@Injectable()
export class PanelService {
  constructor(private readonly consultas: ConsultasService) {}

  /**
   * Todos los números del panel salen de las mismas consultas que alimentan los reportes,
   * así lo que se ve en pantalla y lo que se exporta no pueden diferir.
   */
  async resumen({ desde, hasta, meses, loteoId }: PanelConsulta): Promise<Panel> {
    const primerMes = sumarMeses(mesDe(hoy()), -(meses - 1));

    const [cobros, deuda, conteos, morosos, evolucion, planesVigentes] = await Promise.all([
      this.consultas.cobrosDelRango({ desde, hasta, loteoId }),
      this.consultas.deuda(loteoId),
      this.consultas.conteos(loteoId),
      this.consultas.morosos(loteoId),
      this.consultas.evolucion(primerMes, loteoId),
      this.consultas.planesVigentes(loteoId),
    ]);

    return {
      desde,
      hasta,
      cobrado: cobros.total,
      cobros: cobros.cantidad,
      deudaTotal: deuda.total,
      deudaVencida: deuda.vencida,
      cuotasPendientes: deuda.cuotas,
      cuotasVencidas: deuda.cuotasVencidas,
      sociosActivos: conteos.sociosActivos,
      sociosEnMora: morosos.length,
      morosidad: conteos.sociosActivos === 0 ? 0 : (morosos.length / conteos.sociosActivos) * 100,
      parcelasAsignadas: conteos.parcelasAsignadas,
      parcelasTotales: conteos.parcelasTotales,
      planesVigentes,
      evolucion: Array.from({ length: meses }, (_, i) => {
        const mes = sumarMeses(primerMes, i);
        const datos = evolucion.get(mes) ?? { emitido: 0, cobrado: 0 };
        return { mes, etiqueta: etiquetaPeriodo(mes, 'MENSUAL'), ...datos };
      }),
      topMorosos: morosos.slice(0, TOP_MOROSOS).map((s) => ({
        socio: { id: s.id, numero: s.numero, nombre: s.nombre, apellido: s.apellido },
        vencidas: s.estadoCuenta.vencidas,
        deuda: s.estadoCuenta.deudaVencida,
      })),
    };
  }
}
