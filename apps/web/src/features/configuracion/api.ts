import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfiguracionAdelanto,
  ConfiguracionAdelantoInput,
  ConfiguracionInteres,
  ConfiguracionInteresInput,
} from '@mf/shared';
import { api } from '@/lib/api';

export const clavesConfiguracion = {
  interes: ['configuracion', 'interes'] as const,
  adelanto: ['configuracion', 'adelanto'] as const,
};

export function useConfiguracionInteres() {
  return useQuery({
    queryKey: clavesConfiguracion.interes,
    queryFn: () => api.get<ConfiguracionInteres>('/configuracion/interes'),
  });
}

export function useGuardarConfiguracionInteres() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConfiguracionInteresInput) => api.put<ConfiguracionInteres>('/configuracion/interes', data),
    onSuccess: (config) => {
      qc.setQueryData(clavesConfiguracion.interes, config);
      // El recargo viaja dentro de la deuda: cambiarlo mueve cuotas, socios y el panel.
      void qc.invalidateQueries({ queryKey: ['cuotas'] });
      void qc.invalidateQueries({ queryKey: ['socios'] });
      void qc.invalidateQueries({ queryKey: ['panel'] });
    },
  });
}

export function useConfiguracionAdelanto() {
  return useQuery({
    queryKey: clavesConfiguracion.adelanto,
    queryFn: () => api.get<ConfiguracionAdelanto>('/configuracion/adelanto'),
  });
}

export function useGuardarConfiguracionAdelanto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConfiguracionAdelantoInput) => api.put<ConfiguracionAdelanto>('/configuracion/adelanto', data),
    onSuccess: (config) => {
      qc.setQueryData(clavesConfiguracion.adelanto, config);
      // Cambian los meses que se pueden adelantar y el descuento: las vistas previas
      // que estén cacheadas quedaron viejas.
      void qc.invalidateQueries({ queryKey: ['cuotas'] });
    },
  });
}
