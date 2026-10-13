import { Injectable } from '@nestjs/common';
import { admiteMora, type ConfiguracionInteres, type ConfiguracionInteresGuardar, type MoraDeCuota } from '@mf/shared';
import type { ConfiguracionInteres as FilaInteres, EstadoCuota, OrigenCuota } from '@prisma/client';
import { reglaIncumplida } from '../common/errores';
import { deFecha } from '../common/fechas';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Interés por mora. Es una única fila, como la configuración de avisos: el club elige el
 * porcentaje que se propone al cobrar una cuota vencida, y todo lo que cobra o refinancia
 * deuda pasa por acá para validar la mora que se decidió sumar.
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
   * está apagado, que es lo que `moraSugerida` espera para no proponer nada.
   */
  async vigente(): Promise<ConfiguracionInteres | null> {
    const config = await this.obtener();
    return config.activo && config.porcentaje > 0 ? config : null;
  }

  /**
   * La mora que se suma a cada cuota de un cobro o de un plan, por id. El importe lo
   * decide quien cobra —el sugerido es solo el valor inicial—, pero no a qué cuotas: tiene
   * que ser una de las elegidas, de parcela y ya vencida.
   */
  async moras(
    cuotas: { id: number; vencimiento: Date; estado: EstadoCuota; origen: OrigenCuota }[],
    pedidas: MoraDeCuota[],
    hoyISO: string,
  ): Promise<Map<number, number>> {
    const moras = new Map<number, number>();
    if (pedidas.length === 0) return moras;
    if (!(await this.vigente())) throw reglaIncumplida('El interés por mora está apagado en la configuración', 'moras');

    const porId = new Map(cuotas.map((c) => [c.id, c]));
    for (const { cuotaId, importe } of pedidas) {
      const cuota = porId.get(cuotaId);
      if (!cuota) throw reglaIncumplida('La mora tiene que ser de una de las cuotas elegidas', 'moras');
      if (!admiteMora({ ...cuota, vencimiento: deFecha(cuota.vencimiento) }, hoyISO)) {
        throw reglaIncumplida('Solo se puede sumar mora a una cuota de parcela vencida', 'moras');
      }
      moras.set(cuotaId, importe);
    }
    return moras;
  }

  /** Se crea con los valores por defecto la primera vez que alguien la pide. */
  private fila(): Promise<FilaInteres> {
    return this.prisma.configuracionInteres.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
}

const aDTO = (f: FilaInteres): ConfiguracionInteres => ({
  activo: f.activo,
  porcentaje: Number(f.porcentaje),
  actualizadoEn: f.updatedAt.toISOString(),
});
