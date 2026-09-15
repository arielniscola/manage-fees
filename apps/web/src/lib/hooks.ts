import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useDebounce<T>(valor: T, ms = 300): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

/**
 * Filtros de un listado guardados en la URL (?q=&estado=&page=),
 * para que volver atrás o compartir el link conserve la búsqueda.
 */
export function useFiltrosUrl<E extends string>(estadoPorDefecto: E) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = (params.get('estado') as E | null) ?? estadoPorDefecto;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const actualizar = (cambios: { q?: string; estado?: E; page?: number }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(cambios)) {
          if (v === undefined || v === '' || (k === 'page' && v === 1) || (k === 'estado' && v === estadoPorDefecto)) next.delete(k);
          else next.set(k, String(v));
        }
        // Cambiar búsqueda o estado vuelve a la primera página.
        if (!('page' in cambios)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  return { q, estado, page, actualizar };
}
