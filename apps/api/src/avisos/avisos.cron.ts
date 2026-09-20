import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZONA_HORARIA } from '@mf/shared';
import { AvisosService } from './avisos.service';

/** `AVISOS_CRON=off` desactiva el proceso automático (útil en desarrollo). */
export const cronActivo = (): boolean => (process.env.AVISOS_CRON ?? '').toLowerCase() !== 'off';

/**
 * Corre cada hora y adentro comprueba si es la hora configurada y si hoy todavía no
 * corrió. La hora se elige desde la pantalla, así que no puede vivir en la expresión cron.
 */
@Injectable()
export class AvisosCron implements OnApplicationBootstrap {
  private readonly log = new Logger('AvisosCron');

  constructor(private readonly avisos: AvisosService) {}

  onApplicationBootstrap() {
    this.log.log(`Avisos de vencimiento: se revisa cada hora la hora configurada (${ZONA_HORARIA})`);
  }

  @Cron('5 * * * *', { name: 'avisos-vencimiento', timeZone: ZONA_HORARIA })
  async revisar() {
    try {
      const hora = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', hour12: false }).format(new Date()),
      );
      if (!(await this.avisos.correspondeCorrer(hora))) return;
      await this.avisos.ejecutar({ simular: false });
    } catch (e) {
      // Un error acá no puede voltear la API: dentro de una hora vuelve a revisar.
      this.log.error('Falló el proceso de avisos', e instanceof Error ? e.stack : String(e));
    }
  }
}
