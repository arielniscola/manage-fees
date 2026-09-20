import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZONA_HORARIA } from '@mf/shared';
import { GeneracionService } from './generacion.service';

/** Horario de la corrida diaria. `CUOTAS_CRON=off` la desactiva (útil en desarrollo). */
export const EXPRESION_CRON = process.env.CUOTAS_CRON || '15 3 * * *';

export const cronActivo = (): boolean => EXPRESION_CRON.toLowerCase() !== 'off';

/**
 * Genera todos los días las cuotas que hayan quedado pendientes. No es la única vía:
 * el botón «Generar período» hace exactamente lo mismo, y correr las dos no duplica nada.
 */
@Injectable()
export class CuotasCron implements OnApplicationBootstrap {
  private readonly log = new Logger('CuotasCron');

  constructor(private readonly generacion: GeneracionService) {}

  onApplicationBootstrap() {
    this.log.log(`Generación automática de cuotas programada (${EXPRESION_CRON}, ${ZONA_HORARIA})`);
  }

  @Cron(EXPRESION_CRON, { name: 'generar-cuotas', timeZone: ZONA_HORARIA })
  async generar() {
    try {
      await this.generacion.generarHastaHoy();
    } catch (e) {
      // Un error acá no puede voltear la API: mañana vuelve a intentar.
      this.log.error('Falló la generación automática de cuotas', e instanceof Error ? e.stack : String(e));
    }
  }
}
