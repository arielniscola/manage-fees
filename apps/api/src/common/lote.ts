import { HttpException } from '@nestjs/common';
import type { ResultadoLote } from '@mf/shared';

/**
 * Corre la acción individual sobre cada registro, uno por uno y cada uno en su propia
 * transacción: así un lote valida exactamente lo mismo que la acción suelta. Un rechazo
 * de las reglas (404, 409, 422) saltea ese registro y sigue; cualquier otro error corta.
 */
export async function enLote(ids: number[], accion: (id: number) => Promise<unknown>): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { procesados: 0, omitidos: [] };
  for (const id of ids) {
    try {
      await accion(id);
      resultado.procesados += 1;
    } catch (e) {
      if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
      resultado.omitidos.push({ id, motivo: mensajeDe(e) });
    }
  }
  return resultado;
}

function mensajeDe(e: HttpException): string {
  const respuesta = e.getResponse();
  if (typeof respuesta === 'string') return respuesta;
  const { message } = respuesta as { message?: string | string[] };
  return Array.isArray(message) ? message.join(', ') : (message ?? e.message);
}
