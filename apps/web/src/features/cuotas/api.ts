import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AlcanceTarifa,
  CuotaAnularInput,
  CuotaListarInput,
  CuotasDeSocioInput,
  CuotaListItem,
  GenerarCuotasInput,
  Paginado,
  ResultadoGeneracion,
  Tarifa,
  TarifaActualizarInput,
  TarifaCrearInput,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesCuotas = {
  todas: ['cuotas'] as const,
  lista: (f: CuotaListarInput) => ['cuotas', 'lista', f] as const,
  deSocio: (socioId: number, estado: string) => ['cuotas', 'socio', socioId, estado] as const,
  tarifas: ['tarifas'] as const,
};

/** Generar o anular cuotas cambia la deuda, y con ella los listados de socios. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesCuotas.todas });
    void qc.invalidateQueries({ queryKey: clavesCuotas.tarifas });
    void qc.invalidateQueries({ queryKey: ['socios'] });
  };
}

export function useCuotas(filtros: CuotaListarInput, opciones?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clavesCuotas.lista(filtros),
    queryFn: () => api.get<Paginado<CuotaListItem>>('/cuotas', filtros),
    placeholderData: keepPreviousData,
    enabled: opciones?.enabled ?? true,
  });
}

/** Todas las cuotas del socio, sin paginar. `impaga` trae las que se pueden cobrar. */
export function useCuotasDeSocio(
  socioId: number,
  estado: CuotasDeSocioInput['estado'] = 'todas',
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clavesCuotas.deSocio(socioId, estado ?? 'todas'),
    queryFn: () => api.get<CuotaListItem[]>(`/socios/${socioId}/cuotas`, { estado }),
    enabled: (opciones?.enabled ?? true) && !!socioId,
  });
}

export function useAnularCuota() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...body }: CuotaAnularInput & { id: number }) =>
      api.post<CuotaListItem>(`/cuotas/${id}/anular`, body),
    onSuccess: invalidar,
  });
}

/** Vista previa de la generación: no escribe nada, solo cuenta qué falta. */
export function useVistaPreviaGeneracion(hasta: string, habilitada: boolean) {
  return useQuery({
    queryKey: ['cuotas', 'vista-previa', hasta],
    queryFn: () => api.post<ResultadoGeneracion>('/cuotas/generar', { hasta, simular: true }),
    enabled: habilitada,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useGenerarCuotas() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (body: GenerarCuotasInput) => api.post<ResultadoGeneracion>('/cuotas/generar', { ...body, simular: false }),
    onSuccess: invalidar,
  });
}

/** Sin alcance trae el historial de las dos cuotas; con alcance, solo el de esa. */
export function useTarifas(alcance?: AlcanceTarifa) {
  return useQuery({
    queryKey: [...clavesCuotas.tarifas, alcance ?? 'todas'] as const,
    queryFn: () => api.get<Tarifa[]>('/tarifas', alcance ? { alcance } : {}),
  });
}

export function useGuardarTarifa(id: number | null) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (data: TarifaCrearInput | TarifaActualizarInput) =>
      id ? api.patch<Tarifa>(`/tarifas/${id}`, data) : api.post<Tarifa>('/tarifas', data),
    onSuccess: invalidar,
  });
}

export function useEliminarTarifa() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/tarifas/${id}`),
    onSuccess: invalidar,
  });
}
