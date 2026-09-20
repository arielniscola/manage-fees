import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AsignacionCrearInput,
  AsignacionLiberarInput,
  Paginado,
  ResultadoImportacion,
  SocioActualizarInput,
  SocioBajaInput,
  SocioCrearInput,
  SocioDetalle,
  SocioListarInput,
  SocioListItem,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesSocios = {
  todos: ['socios'] as const,
  lista: (f: SocioListarInput) => ['socios', 'lista', f] as const,
  detalle: (id: number) => ['socios', 'detalle', id] as const,
};

export function useSocios(filtros: SocioListarInput) {
  return useQuery({
    queryKey: clavesSocios.lista(filtros),
    queryFn: () => api.get<Paginado<SocioListItem>>('/socios', filtros),
    placeholderData: keepPreviousData,
  });
}

export function useSocio(id: number | undefined) {
  return useQuery({
    queryKey: clavesSocios.detalle(id ?? 0),
    queryFn: () => api.get<SocioDetalle>(`/socios/${id}`),
    enabled: !!id,
  });
}

/** Cualquier cambio en socios o asignaciones invalida también los listados de parcelas. */
function useInvalidar() {
  const qc = useQueryClient();
  return (socio?: SocioDetalle) => {
    if (socio) qc.setQueryData(clavesSocios.detalle(socio.id), socio);
    void qc.invalidateQueries({ queryKey: clavesSocios.todos });
    void qc.invalidateQueries({ queryKey: ['parcelas'] });
  };
}

export function useCrearSocio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: SocioCrearInput) => api.post<SocioDetalle>('/socios', data),
    onSuccess: invalidar,
  });
}

export function useActualizarSocio(id: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: SocioActualizarInput) => api.patch<SocioDetalle>(`/socios/${id}`, data),
    onSuccess: invalidar,
  });
}

export function useBajaSocio(id: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: SocioBajaInput) => api.post<SocioDetalle>(`/socios/${id}/baja`, data),
    onSuccess: invalidar,
  });
}

export function useReactivarSocio(id: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => api.post<SocioDetalle>(`/socios/${id}/reactivar`),
    onSuccess: invalidar,
  });
}

export function useAsignarParcela(socioId: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: AsignacionCrearInput) => api.post(`/socios/${socioId}/asignaciones`, data),
    onSuccess: () => invalidar(),
  });
}

export function useLiberarParcela() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ asignacionId, ...data }: AsignacionLiberarInput & { asignacionId: number }) =>
      api.post(`/asignaciones/${asignacionId}/liberar`, data),
    onSuccess: () => invalidar(),
  });
}

// ---------------------------------------------------------------- Importación del padrón

/** El archivo y, si se eligió, el loteo donde se crean las manzanas y lotes que falten. */
export interface ArchivoPadron {
  archivo: File;
  loteoId?: number;
}

const conLoteo = (path: string, loteoId?: number) => (loteoId ? `${path}?loteoId=${loteoId}` : path);

/** Analiza el archivo sin escribir nada: dice qué pasaría con cada fila. */
export function usePrevisualizarImportacion() {
  return useMutation({
    mutationFn: ({ archivo, loteoId }: ArchivoPadron) =>
      api.subir<ResultadoImportacion>(conLoteo('/socios/importar/previsualizar', loteoId), archivo),
  });
}

/** Confirma la importación. Todo o nada: si alguna fila falla, no entra ninguna. */
export function useImportarSocios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, loteoId }: ArchivoPadron) =>
      api.subir<ResultadoImportacion>(conLoteo('/socios/importar', loteoId), archivo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesSocios.todos });
      // Las parcelas quedan asignadas, y puede haber manzanas y lotes nuevos: sus
      // listados y el panel también cambian.
      void qc.invalidateQueries({ queryKey: ['parcelas'] });
      void qc.invalidateQueries({ queryKey: ['sectores'] });
      void qc.invalidateQueries({ queryKey: ['loteos'] });
      void qc.invalidateQueries({ queryKey: ['panel'] });
    },
  });
}

export const urlPlantillaPadron = (): string => '/api/socios/importar/plantilla?formato=csv';
