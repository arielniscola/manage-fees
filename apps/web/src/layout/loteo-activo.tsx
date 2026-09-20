import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Loteo activo del sidebar: mientras haya uno elegido, todos los listados muestran solo
 * lo suyo. Socio no cuelga de Loteo (la relación es Socio > Asignación > Parcela >
 * Sector > Loteo), así que del lado del servidor «ser de un loteo» es tener una parcela
 * vigente en él; un suplente o un socio sin parcela no aparece hasta volver a «Todos».
 *
 * Se guarda en el navegador, no en la URL: la elección acompaña al usuario de una
 * pantalla a otra sin ensuciar los filtros que cada listado sí publica en el link.
 */
const CLAVE = 'mf.loteoActivo';

const leerGuardado = (): number | undefined => {
  try {
    const guardado = Number(localStorage.getItem(CLAVE));
    return Number.isInteger(guardado) && guardado > 0 ? guardado : undefined;
  } catch {
    // Navegación privada o almacenamiento bloqueado: se arranca en «Todos los loteos».
    return undefined;
  }
};

interface LoteoActivo {
  /** `undefined` es «Todos los loteos»: los listados no se filtran. */
  loteoId: number | undefined;
  elegir: (id: number | undefined) => void;
}

const Contexto = createContext<LoteoActivo>({ loteoId: undefined, elegir: () => {} });

export function LoteoActivoProvider({ children }: { children: ReactNode }) {
  const [loteoId, setLoteoId] = useState<number | undefined>(leerGuardado);

  const elegir = useCallback((id: number | undefined) => {
    setLoteoId(id);
    try {
      if (id) localStorage.setItem(CLAVE, String(id));
      else localStorage.removeItem(CLAVE);
    } catch {
      // Sin almacenamiento la elección vale igual, pero solo hasta recargar.
    }
  }, []);

  const valor = useMemo(() => ({ loteoId, elegir }), [loteoId, elegir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useLoteoActivo = (): LoteoActivo => useContext(Contexto);
