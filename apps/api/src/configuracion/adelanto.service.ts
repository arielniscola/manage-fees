import { Injectable } from '@nestjs/common';
import type { ConfiguracionAdelanto, ConfiguracionAdelantoGuardar } from '@mf/shared';
import type { ConfiguracionAdelanto as FilaAdelanto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Reglas para adelantar cuotas: hasta cuántos meses se puede llegar y qué descuento lleva
 * el pago adelantado. Es una única fila, como el interés por mora y los avisos.
 */
@Injectable()
export class AdelantoService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(): Promise<ConfiguracionAdelanto> {
    return aDTO(await this.fila());
  }

  async guardar(datos: ConfiguracionAdelantoGuardar): Promise<ConfiguracionAdelanto> {
    await this.fila();
    return aDTO(await this.prisma.configuracionAdelanto.update({ where: { id: 1 }, data: datos }));
  }

  /** Se crea con los valores por defecto la primera vez que alguien la pide. */
  private fila(): Promise<FilaAdelanto> {
    return this.prisma.configuracionAdelanto.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
}

const aDTO = (f: FilaAdelanto): ConfiguracionAdelanto => ({
  activo: f.activo,
  mesesMaximos: f.mesesMaximos,
  descuento: Number(f.descuento),
  minimoMeses: f.minimoMeses,
  actualizadoEn: f.updatedAt.toISOString(),
});
