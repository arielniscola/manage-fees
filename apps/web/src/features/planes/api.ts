import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginado,
  PlanCancelarInput,
  PlanCrearInput,
  PlanDetalle,
  PlanListarInput,
  PlanListItem,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesPlanes = {
  todos: ['planes'] as const,
  lista: (f: PlanListarInput) => ['planes', 'lista', f] as const,
  detalle: (id: number) => ['planes', 'detalle', id] as const,
  deSocio: (socioId: number) => ['planes', 'socio', socioId] as const,
};

/** Firmar o cancelar un plan mueve las cuotas y la deuda del socio. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesPlanes.todos });
    void qc.invalidateQueries({ queryKey: ['cuotas'] });
    void qc.invalidateQueries({ queryKey: ['cobros'] });
    void qc.invalidateQueries({ queryKey: ['socios'] });
  };
}

export function usePlanes(filtros: PlanListarInput) {
  return useQuery({
    queryKey: clavesPlanes.lista(filtros),
    queryFn: () => api.get<Paginado<PlanListItem>>('/planes', filtros),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(id: number | null) {
  return useQuery({
    queryKey: clavesPlanes.detalle(id ?? 0),
    queryFn: () => api.get<PlanDetalle>(`/planes/${id}`),
    enabled: !!id,
  });
}

export function usePlanesDeSocio(socioId: number) {
  return useQuery({
    queryKey: clavesPlanes.deSocio(socioId),
    queryFn: () => api.get<PlanListItem[]>(`/socios/${socioId}/planes`),
    enabled: !!socioId,
  });
}

export function useCrearPlan() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: PlanCrearInput) => api.post<PlanDetalle>('/planes', data),
    onSuccess: invalidar,
  });
}

export function useCancelarPlan() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...body }: PlanCancelarInput & { id: number }) => api.post<PlanDetalle>(`/planes/${id}/cancelar`, body),
    onSuccess: invalidar,
  });
}
