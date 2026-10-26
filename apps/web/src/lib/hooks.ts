import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { DireccionOrden } from '@mf/shared';

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
export function useFiltrosUrl<E extends string>(estadoPorDefecto: E, reiniciarCon?: unknown) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = (params.get('estado') as E | null) ?? estadoPorDefecto;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const actualizar = (cambios: { q?: string; estado?: E; page?: number; [otro: string]: string | number | undefined }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(cambios)) {
          if (v === undefined || v === '' || (k === 'page' && v === 1) || (k === 'estado' && v === estadoPorDefecto)) next.delete(k);
          else next.set(k, String(v));
        }
        // Cambiar cualquier filtro vuelve a la primera página.
        if (!('page' in cambios)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Cambiar de loteo activo deja la paginación sin sentido: se vuelve a la primera página.
  const anterior = useRef(reiniciarCon);
  useEffect(() => {
    if (anterior.current === reiniciarCon) return;
    anterior.current = reiniciarCon;
    actualizar({ page: 1 });
  }, [reiniciarCon]);

  return { q, estado, page, params, actualizar };
}

export interface OrdenTabla<C extends string> {
  columna: C;
  dir: DireccionOrden;
  ordenar: (columna: C, primero?: DireccionOrden) => void;
  /** Lo que se manda a la API: nada mientras rija el orden por defecto del listado. */
  query: { orden?: C; dir?: DireccionOrden };
}

/**
 * Orden de un listado guardado en la URL (?orden=&dir=), junto a los filtros. `porDefecto`
 * tiene que coincidir con el orden que la API usa sin parámetros, para que la flecha diga
 * la verdad; elegirlo de nuevo lo saca de la URL. Una columna que no está en `columnas`
 * —por ejemplo, la deuda fuera del listado de morosos— se ignora.
 */
export function useOrdenUrl<C extends string>(
  { params, actualizar }: { params: URLSearchParams; actualizar: (cambios: { orden?: string; dir?: string }) => void },
  columnas: readonly C[],
  porDefecto: { columna: C; dir: DireccionOrden },
): OrdenTabla<C> {
  const enUrl = params.get('orden') as C | null;
  const elegida = enUrl && columnas.includes(enUrl) ? enUrl : null;
  const columna = elegida ?? porDefecto.columna;
  const dir: DireccionOrden = elegida ? (params.get('dir') === 'desc' ? 'desc' : 'asc') : porDefecto.dir;

  const ordenar = (nueva: C, primero: DireccionOrden = 'asc') => {
    const nuevoDir = nueva === columna ? (dir === 'asc' ? 'desc' : 'asc') : primero;
    const esDefecto = nueva === porDefecto.columna && nuevoDir === porDefecto.dir;
    actualizar(esDefecto ? { orden: undefined, dir: undefined } : { orden: nueva, dir: nuevoDir });
  };

  return { columna, dir, ordenar, query: elegida ? { orden: elegida, dir } : {} };
}
