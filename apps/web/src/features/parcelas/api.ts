import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeudaDeTransferencia,
  Paginado,
  ParcelaActualizarInput,
  ParcelaCrearInput,
  ParcelaDetalle,
  ParcelaListarInput,
  ParcelaListItem,
  Sector,
  SectorActualizarInput,
  SectorCrearInput,
  Loteo,
  LoteoActualizarInput,
  LoteoCrearInput,
  Transferencia,
  TransferenciaCrearInput,
  TransferenciaListarInput,
  TransferenciaRealizada,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesParcelas = {
  todas: ['parcelas'] as const,
  sectores: ['sectores'] as const,
  sectoresDe: (loteoId?: number) => ['sectores', loteoId ?? 'todos'] as const,
  loteos: ['loteos'] as const,
  transferencias: (f: TransferenciaListarInput) => ['transferencias', 'lista', f] as const,
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
    void qc.invalidateQueries({ queryKey: clavesParcelas.sectores });
    void qc.invalidateQueries({ queryKey: clavesParcelas.loteos });
    void qc.invalidateQueries({ queryKey: ['transferencias'] });
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

// ---------------------------------------------------------------- Sectores

/** Sin loteo trae todos los sectores; con loteo activo, solo los suyos. */
export function useSectores(loteoId?: number) {
  return useQuery({
    queryKey: clavesParcelas.sectoresDe(loteoId),
    queryFn: () => api.get<Sector[]>('/sectores', loteoId ? { loteoId } : {}),
  });
}

export function useGuardarSector(id: number | null) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: SectorCrearInput | SectorActualizarInput) =>
      id ? api.patch<Sector>(`/sectores/${id}`, data) : api.post<Sector>('/sectores', data),
    onSuccess: invalidar,
  });
}

export function useEliminarSector() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/sectores/${id}`),
    onSuccess: invalidar,
  });
}

// ---------------------------------------------------------------- Loteos

export function useLoteos() {
  return useQuery({
    queryKey: clavesParcelas.loteos,
    queryFn: () => api.get<Loteo[]>('/loteos'),
  });
}

export function useGuardarLoteo(id: number | null) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: LoteoCrearInput | LoteoActualizarInput) =>
      id ? api.patch<Loteo>(`/loteos/${id}`, data) : api.post<Loteo>('/loteos', data),
    onSuccess: invalidar,
  });
}

export function useEliminarLoteo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/loteos/${id}`),
    onSuccess: invalidar,
  });
}

// ---------------------------------------------------------------- Transferencias

export function useTransferencias(filtros: TransferenciaListarInput) {
  return useQuery({
    queryKey: clavesParcelas.transferencias(filtros),
    queryFn: () => api.get<Paginado<Transferencia>>('/transferencias', filtros),
    placeholderData: keepPreviousData,
  });
}

/**
 * Lo que la parcela debe al día de la transferencia: son cuotas que quedan con el titular
 * que sale y hay que refinanciar antes de entregarla.
 */
export function useDeudaDeTransferencia(parcelaId: number | null, fecha: string) {
  return useQuery({
    queryKey: ['transferencias', 'deuda', parcelaId, fecha] as const,
    queryFn: () => api.get<DeudaDeTransferencia>(`/parcelas/${parcelaId}/transferencia/deuda`, { fecha }),
    enabled: !!parcelaId && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
  });
}

export function useTransferenciasDeSocio(socioId: number) {
  return useQuery({
    queryKey: ['transferencias', 'socio', socioId],
    queryFn: () => api.get<Transferencia[]>(`/socios/${socioId}/transferencias`),
    enabled: !!socioId,
  });
}

/** Pasa la parcela del titular actual a otro socio. */
export function useTransferirParcela(parcelaId: number) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: TransferenciaCrearInput) => api.post<TransferenciaRealizada>(`/parcelas/${parcelaId}/transferir`, data),
    onSuccess: invalidar,
  });
}
