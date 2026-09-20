import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvisoPruebaInput,
  ConfiguracionAvisosCompleta,
  ConfiguracionAvisosInput,
  EnvioListarInput,
  EnviosPaginados,
  ResultadoAvisos,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesAvisos = {
  configuracion: ['avisos', 'configuracion'] as const,
  envios: (f: EnvioListarInput) => ['avisos', 'envios', f] as const,
};

export function useConfiguracionAvisos() {
  return useQuery({
    queryKey: clavesAvisos.configuracion,
    queryFn: () => api.get<ConfiguracionAvisosCompleta>('/avisos/configuracion'),
  });
}

export function useGuardarConfiguracionAvisos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConfiguracionAvisosInput) =>
      api.put<ConfiguracionAvisosCompleta>('/avisos/configuracion', data),
    onSuccess: (config) => qc.setQueryData(clavesAvisos.configuracion, config),
  });
}

export function useEnvios(filtros: EnvioListarInput) {
  return useQuery({
    queryKey: clavesAvisos.envios(filtros),
    queryFn: () => api.get<EnviosPaginados>('/avisos/envios', filtros),
    placeholderData: keepPreviousData,
  });
}

/** Vista previa: calcula a quién le tocaría el aviso hoy, sin mandar nada. */
export function useVistaPreviaAvisos(habilitada: boolean) {
  return useQuery({
    queryKey: ['avisos', 'vista-previa'],
    queryFn: () => api.post<ResultadoAvisos>('/avisos/ejecutar', { simular: true }),
    enabled: habilitada,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useEjecutarAvisos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ResultadoAvisos>('/avisos/ejecutar', { simular: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['avisos'] });
    },
  });
}

export function useProbarAviso() {
  return useMutation({
    mutationFn: (data: AvisoPruebaInput) => api.post<void>('/avisos/probar', data),
  });
}
