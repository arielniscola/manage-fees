import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DevolucionAnularInput,
  DevolucionCrearInput,
  DevolucionDetalle,
  DevolucionesPaginadas,
  DevolucionListarInput,
  MotivoDevolucion,
  MotivoDevolucionActualizarInput,
  MotivoDevolucionInput,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesDevoluciones = {
  todas: ['devoluciones'] as const,
  lista: (f: DevolucionListarInput) => ['devoluciones', 'lista', f] as const,
  detalle: (id: number) => ['devoluciones', 'detalle', id] as const,
  motivos: ['motivos-devolucion'] as const,
};

/** Devolver o anular mueve el cobro, sus cuotas, la deuda y la recaudación. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesDevoluciones.todas });
    void qc.invalidateQueries({ queryKey: ['cobros'] });
    void qc.invalidateQueries({ queryKey: ['cuotas'] });
    void qc.invalidateQueries({ queryKey: ['socios'] });
    void qc.invalidateQueries({ queryKey: ['planes'] });
    void qc.invalidateQueries({ queryKey: ['parcelas'] });
    void qc.invalidateQueries({ queryKey: ['panel'] });
  };
}

export function useDevoluciones(filtros: DevolucionListarInput) {
  return useQuery({
    queryKey: clavesDevoluciones.lista(filtros),
    queryFn: () => api.get<DevolucionesPaginadas>('/devoluciones', filtros),
    placeholderData: keepPreviousData,
  });
}

export function useDevolucion(id: number | null) {
  return useQuery({
    queryKey: clavesDevoluciones.detalle(id ?? 0),
    queryFn: () => api.get<DevolucionDetalle>(`/devoluciones/${id}`),
    enabled: !!id,
  });
}

export function useRegistrarDevolucion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ cobroId, ...body }: DevolucionCrearInput & { cobroId: number }) =>
      api.post<DevolucionDetalle>(`/cobros/${cobroId}/devolucion`, body),
    onSuccess: invalidar,
  });
}

export function useAnularDevolucion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...body }: DevolucionAnularInput & { id: number }) =>
      api.post<DevolucionDetalle>(`/devoluciones/${id}/anular`, body),
    onSuccess: invalidar,
  });
}

export function useMotivosDevolucion() {
  return useQuery({
    queryKey: clavesDevoluciones.motivos,
    queryFn: () => api.get<MotivoDevolucion[]>('/motivos-devolucion'),
  });
}

export function useCrearMotivoDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MotivoDevolucionInput) => api.post<MotivoDevolucion>('/motivos-devolucion', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: clavesDevoluciones.motivos }),
  });
}

export function useActualizarMotivoDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: MotivoDevolucionActualizarInput & { id: number }) =>
      api.patch<MotivoDevolucion>(`/motivos-devolucion/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: clavesDevoluciones.motivos }),
  });
}

/** El comprobante se sirve como PDF desde la API, igual que el recibo. */
export const urlComprobanteDevolucion = (id: number, descargar = false): string =>
  `/api/devoluciones/${id}/comprobante.pdf${descargar ? '?descargar=1' : ''}`;
