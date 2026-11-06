import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { numeroRecibo, pesos, type SocioResumen } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { useSocios } from '@/features/socios/api';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { dni as formatoDni, fecha, iniciales, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce } from '@/lib/hooks';
import { useCobro, useCobrosDeSocio } from '@/features/cobros/api';
import { RegistrarDevolucionDialog } from './RegistrarDevolucionDialog';

/** Primero se busca el socio, después se elige cuál de sus recibos se devuelve. */
export function NuevaDevolucionDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [socio, setSocio] = useState<SocioResumen | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  const { data: cobro } = useCobro(elegido);

  useEffect(() => {
    if (abierto) {
      setSocio(null);
      setElegido(null);
    }
  }, [abierto]);

  const cerrar = () => {
    setSocio(null);
    setElegido(null);
    onCerrar();
  };

  return (
    <>
      <ElegirSocioDialog abierto={abierto && !socio} onCerrar={cerrar} onElegir={setSocio} />
      {socio && (
        <ElegirReciboDialog
          abierto={abierto && !elegido}
          socio={socio}
          onCerrar={cerrar}
          onVolver={() => setSocio(null)}
          onElegir={setElegido}
        />
      )}
      <RegistrarDevolucionDialog cobro={abierto && elegido ? (cobro ?? null) : null} onCerrar={cerrar} />
    </>
  );
}

function ElegirSocioDialog({
  abierto,
  onCerrar,
  onElegir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (s: SocioResumen) => void;
}) {
  const [texto, setTexto] = useState('');
  const q = useDebounce(texto);
  const { loteoId } = useLoteoActivo();
  // También los dados de baja: es común devolverle a quien se va.
  const { data } = useSocios({ q: q || undefined, estado: 'todos', loteoId, page: 1, pageSize: 8 });

  useEffect(() => {
    if (abierto) setTexto('');
  }, [abierto]);

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Nueva devolución"
      descripcion="Buscá el socio al que se le devuelve el dinero."
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-socio-devolucion"
            type="search"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, DNI, N° de socio o parcela"
            className="pl-10"
            aria-label="Buscar socio"
          />
        </div>

        <div className="flex flex-col gap-1">
          {!data ? (
            <p className="py-6 text-center text-sm text-tenue">Buscando…</p>
          ) : data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-tenue">No hay socios que coincidan.</p>
          ) : (
            data.items.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onElegir(s)}
                className="flex items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-superficie-2"
              >
                <Avatar texto={iniciales(s)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{nombreCompleto(s)}</span>
                  <span className="text-xs tabular text-tenue">
                    N° {s.numero} · DNI {formatoDni(s.dni)}
                  </span>
                </span>
                {s.estado === 'baja' && <Badge tono="baja">Baja</Badge>}
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ElegirReciboDialog({
  abierto,
  socio,
  onCerrar,
  onVolver,
  onElegir,
}: {
  abierto: boolean;
  socio: SocioResumen;
  onCerrar: () => void;
  onVolver: () => void;
  onElegir: (cobroId: number) => void;
}) {
  const { data, isPending, isError, error } = useCobrosDeSocio(socio.id);
  // Los vigentes, del más reciente al más viejo; los anulados no se pueden devolver.
  const recibos = useMemo(
    () => (data ?? []).filter((c) => !c.anulado).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numeroRecibo - a.numeroRecibo),
    [data],
  );

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo="Nueva devolución"
      descripcion={`Elegí el recibo de ${nombreCompleto(socio)} que se devuelve. Se devuelve el cobro entero.`}
      pie={
        <Button variante="secundario" onClick={onVolver}>
          <ArrowLeft /> Cambiar socio
        </Button>
      }
    >
      {isError ? (
        <p className="py-6 text-center text-sm text-mor">{error.message}</p>
      ) : isPending ? (
        <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
      ) : recibos.length === 0 ? (
        <p className="py-6 text-center text-sm text-tenue">Este socio no tiene cobros vigentes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde rounded-control border border-borde">
          {recibos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={!!c.devolucion}
                onClick={() => onElegir(c.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium tabular">
                    {fecha(c.fecha)} · Recibo {numeroRecibo(c.numeroRecibo)}
                  </span>
                  <span className="text-xs text-tenue">
                    {plural(c.cantidadCuotas, 'cuota')}
                    {c.devolucion && ' · ya devuelto'}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular">{pesos(c.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
