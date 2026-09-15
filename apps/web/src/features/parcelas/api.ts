import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginado, ParcelaActualizarInput, ParcelaCrearInput, ParcelaDetalle, ParcelaListarInput, ParcelaListItem } from '@mf/shared';
import { api } from '@/lib/api';

export const clavesParcelas = {
  todas: ['parcelas'] as const,
  lista: (f: ParcelaListarInput) => ['parcelas', 'lista', f] as const,
  detalle: (id: number) => ['parcelas', 'detalle', id] as const,
};

export function useParcelas(filtros: ParcelaListarInput, opciones?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clavesParcelas.lista(filtros),
    queryFn: () => api.get<Paginado<ParcelaListItem>>('/parcelas', filtros),
    placeholderData: keepPreviousData,
    enabled: opciones?.enabled ?? true,
  });
}

export function useParcela(id: number | null) {
  return useQuery({
    queryKey: clavesParcelas.detalle(id ?? 0),
    queryFn: () => api.get<ParcelaDetalle>(`/parcelas/${id}`),
    enabled: !!id,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesParcelas.todas });
    void qc.invalidateQueries({ queryKey: ['socios'] });
  };
}

export function useGuardarParcela(id: number | null) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: ParcelaCrearInput | ParcelaActualizarInput) =>
      id ? api.patch<ParcelaDetalle>(`/parcelas/${id}`, data) : api.post<ParcelaDetalle>('/parcelas', data),
    onSuccess: invalidar,
  });
}

export function useEliminarParcela() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/parcelas/${id}`),
    onSuccess: invalidar,
  });
}
