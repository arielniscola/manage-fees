import { Injectable } from '@nestjs/common';
import type { ConfiguracionInteres, ConfiguracionInteresGuardar } from '@mf/shared';
import type { ConfiguracionInteres as FilaInteres } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Interés por mora. Es una única fila, como la configuración de avisos: el club elige el
 * porcentaje, el día del mes en que se aplica y si se repite todos los meses o no, y todo lo que muestra o cobra deuda le
 * pregunta a este servicio cuánto recargo le corresponde a cada cuota impaga.
 */
@Injectable()
export class InteresService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(): Promise<ConfiguracionInteres> {
    return aDTO(await this.fila());
  }

  async guardar(datos: ConfiguracionInteresGuardar): Promise<ConfiguracionInteres> {
    await this.fila();
    return aDTO(await this.prisma.configuracionInteres.update({ where: { id: 1 }, data: datos }));
  }

  /**
   * La configuración tal como la consumen los cálculos. Devuelve null cuando el interés
   * está apagado, que es lo que `interesDeCuota` espera para no recargar nada.
   */
  async vigente(): Promise<ConfiguracionInteres | null> {
    const config = await this.obtener();
    return config.activo && config.porcentaje > 0 ? config : null;
  }

  /** Se crea con los valores por defecto la primera vez que alguien la pide. */
  private fila(): Promise<FilaInteres> {
    return this.prisma.configuracionInteres.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
}

const aDTO = (f: FilaInteres): ConfiguracionInteres => ({
  activo: f.activo,
  modo: f.modo,
  diaAplicacion: f.diaAplicacion,
  porcentaje: Number(f.porcentaje),
  actualizadoEn: f.updatedAt.toISOString(),
});
