import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfiguracionInteres, ConfiguracionInteresInput } from '@mf/shared';
import { api } from '@/lib/api';

export const clavesConfiguracion = {
  interes: ['configuracion', 'interes'] as const,
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
