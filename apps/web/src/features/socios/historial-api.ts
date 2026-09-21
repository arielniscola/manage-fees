import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HistorialCrearInput, ResultadoHistorial, ResultadoHistorialManual } from '@mf/shared';
import { api } from '@/lib/api';

/**
 * Historial de cuotas de antes del sistema. Cargarlo mueve la deuda de los socios, así
 * que hay que refrescar cuotas, socios y el panel.
 */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['cuotas'] });
    void qc.invalidateQueries({ queryKey: ['socios'] });
    void qc.invalidateQueries({ queryKey: ['panel'] });
  };
}

/** Analiza el archivo sin escribir nada: dice qué pasaría con cada fila. */
export function usePrevisualizarHistorial() {
  return useMutation({
    mutationFn: (archivo: File) => api.subir<ResultadoHistorial>('/socios/historial/previsualizar', archivo),
  });
}

/** Confirma la carga. Todo o nada: si alguna fila falla, no entra ninguna. */
export function useImportarHistorial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (archivo: File) => api.subir<ResultadoHistorial>('/socios/historial', archivo),
    onSuccess: invalidar,
  });
}

/** Carga a mano de un tramo de períodos, desde la ficha del socio. */
export function useCargarHistorial(socioId: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (datos: HistorialCrearInput) =>
      api.post<ResultadoHistorialManual>(`/socios/${socioId}/historial`, datos),
    onSuccess: invalidar,
  });
}

export const urlPlantillaHistorial = (): string => '/api/socios/historial/plantilla?formato=csv';
