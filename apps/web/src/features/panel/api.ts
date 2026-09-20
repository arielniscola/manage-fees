import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Formato, Panel, PanelInput, TipoReporte } from '@mf/shared';
import { api } from '@/lib/api';

export function usePanel(filtros: PanelInput) {
  return useQuery({
    queryKey: ['panel', filtros],
    queryFn: () => api.get<Panel>('/panel', filtros),
    placeholderData: keepPreviousData,
  });
}

/** Los reportes se descargan directo desde la API, que los sirve como archivo adjunto. */
export function urlReporte(
  tipo: TipoReporte,
  formato: Formato,
  rango: { desde?: string; hasta?: string; loteoId?: number } = {},
): string {
  const params = new URLSearchParams({ formato });
  if (rango.desde) params.set('desde', rango.desde);
  if (rango.hasta) params.set('hasta', rango.hasta);
  if (rango.loteoId) params.set('loteoId', String(rango.loteoId));
  return `/api/reportes/${tipo}?${params.toString()}`;
}
