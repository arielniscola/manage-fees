import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CobroAnularInput,
  CobroCrearInput,
  CobroDetalle,
  CobroListarInput,
  CobroListItem,
  CobrosPaginados,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesCobros = {
  todos: ['cobros'] as const,
  lista: (f: CobroListarInput) => ['cobros', 'lista', f] as const,
  detalle: (id: number) => ['cobros', 'detalle', id] as const,
  deSocio: (socioId: number) => ['cobros', 'socio', socioId] as const,
};

/** Cobrar o anular mueve las cuotas y la deuda, así que hay que refrescar todo eso. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesCobros.todos });
    void qc.invalidateQueries({ queryKey: ['cuotas'] });
    void qc.invalidateQueries({ queryKey: ['socios'] });
  };
}

export function useCobros(filtros: CobroListarInput) {
  return useQuery({
    queryKey: clavesCobros.lista(filtros),
    queryFn: () => api.get<CobrosPaginados>('/cobros', filtros),
    placeholderData: keepPreviousData,
  });
}

export function useCobro(id: number | null) {
  return useQuery({
    queryKey: clavesCobros.detalle(id ?? 0),
    queryFn: () => api.get<CobroDetalle>(`/cobros/${id}`),
    enabled: !!id,
  });
}

export function useCobrosDeSocio(socioId: number) {
  return useQuery({
    queryKey: clavesCobros.deSocio(socioId),
    queryFn: () => api.get<CobroListItem[]>(`/socios/${socioId}/cobros`),
    enabled: !!socioId,
  });
}

export function useRegistrarCobro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: CobroCrearInput) => api.post<CobroDetalle>('/cobros', data),
    onSuccess: invalidar,
  });
}

export function useAnularCobro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...body }: CobroAnularInput & { id: number }) => api.post<CobroDetalle>(`/cobros/${id}/anular`, body),
    onSuccess: invalidar,
  });
}

/** El recibo se sirve como PDF desde la API; el navegador lo abre o lo descarga. */
export const urlRecibo = (cobroId: number, descargar = false): string =>
  `/api/cobros/${cobroId}/recibo.pdf${descargar ? '?descargar=1' : ''}`;
