import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ResultadoLote } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { plural } from '@/lib/formato';

/**
 * Los registros marcados en un listado. Se conservan al cambiar de página, para poder
 * juntar varias, y se vacían cuando cambian los filtros: lo marcado podría dejar de verse.
 */
export function useSeleccion<T extends { id: number }>(reiniciarCon: unknown) {
  const [elegidos, setElegidos] = useState<Map<number, T>>(new Map());

  const clave = JSON.stringify(reiniciarCon);
  const anterior = useRef(clave);
  useEffect(() => {
    if (anterior.current === clave) return;
    anterior.current = clave;
    setElegidos(new Map());
  }, [clave]);

  const alternar = (item: T) =>
    setElegidos((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });

  /** Marca todos los de la página, o los desmarca si ya estaban todos. */
  const alternarPagina = (items: T[]) =>
    setElegidos((prev) => {
      const next = new Map(prev);
      const todos = items.every((i) => next.has(i.id));
      for (const i of items) {
        if (todos) next.delete(i.id);
        else next.set(i.id, i);
      }
      return next;
    });

  return {
    elegidos: [...elegidos.values()],
    cantidad: elegidos.size,
    marcado: (id: number) => elegidos.has(id),
    alternar,
    alternarPagina,
    limpiar: () => setElegidos(new Map()),
  };
}

export type Seleccion<T extends { id: number }> = ReturnType<typeof useSeleccion<T>>;

/** Encabezado de la columna de casillas: marca o desmarca todo lo elegible de la página. */
export function CasillaTodas<T extends { id: number }>({ items, seleccion }: { items: T[]; seleccion: Seleccion<T> }) {
  const marcados = items.filter((i) => seleccion.marcado(i.id)).length;
  return (
    <Th className="w-10 pr-0">
      <input
        type="checkbox"
        aria-label="Elegir todos los de la página"
        disabled={items.length === 0}
        checked={items.length > 0 && marcados === items.length}
        ref={(el) => {
          if (el) el.indeterminate = marcados > 0 && marcados < items.length;
        }}
        onChange={() => seleccion.alternarPagina(items)}
        className="size-4 accent-pino-600 disabled:opacity-40"
      />
    </Th>
  );
}

/** La casilla de una fila. No dispara el clic de la fila, que suele abrir el detalle. */
export function CasillaFila<T extends { id: number }>({
  item,
  seleccion,
  etiqueta,
  deshabilitada,
}: {
  item: T;
  seleccion: Seleccion<T>;
  etiqueta: string;
  deshabilitada?: boolean;
}) {
  return (
    <Td className="w-10 pr-0">
      <input
        type="checkbox"
        aria-label={`Elegir ${etiqueta}`}
        disabled={deshabilitada}
        checked={seleccion.marcado(item.id)}
        onClick={(e) => e.stopPropagation()}
        onChange={() => seleccion.alternar(item)}
        className="size-4 accent-pino-600 disabled:opacity-30"
      />
    </Td>
  );
}

/** Franja sobre la tabla con lo elegido y las acciones que se le pueden aplicar. */
export function BarraLote({ cantidad, onLimpiar, children }: { cantidad: number; onLimpiar: () => void; children: ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-borde bg-pino-50 px-4 py-2.5">
      <span className="text-sm font-semibold">{plural(cantidad, 'elegido', 'elegidos')}</span>
      <button type="button" onClick={onLimpiar} className="text-[13px] font-semibold text-pino-600 hover:underline">
        Quitar selección
      </button>
      <span className="ml-auto flex flex-wrap items-center gap-2">{children}</span>
    </div>
  );
}

interface AccionLoteProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  titulo: string;
  descripcion: ReactNode;
  /** Texto del botón de confirmar, por ejemplo «Eliminar 5 socios». */
  confirmar: string;
  /** Pide un motivo, que se manda junto con el lote. */
  conMotivo?: boolean;
  cargando: boolean;
  /** Corre la acción; resuelve con el resultado del servidor. */
  onConfirmar: (motivo: string | undefined) => Promise<ResultadoLote>;
  /** Cómo se nombra cada registro en la lista de los salteados. */
  etiquetaDe: (id: number) => string;
  /** Lo que se hizo, en participio y plural, para el resumen: «eliminados», «anuladas». */
  hecho: [string, string];
  /** Se llama al cerrar después de correr, con o sin salteados: suele vaciar la selección. */
  onTerminado?: () => void;
}

/**
 * Confirma una acción por lotes y, si el servidor salteó alguno, se queda abierto
 * mostrando cuáles y por qué: un toast se iría antes de poder leerlo.
 */
export function AccionLoteDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  confirmar,
  conMotivo,
  cargando,
  onConfirmar,
  etiquetaDe,
  hecho,
  onTerminado,
}: AccionLoteProps) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);

  useEffect(() => {
    if (abierto) {
      setMotivo('');
      setError(null);
      setResultado(null);
    }
  }, [abierto]);

  const correr = async () => {
    if (conMotivo && motivo.trim().length < 3) return setError('Contá por qué se anulan');
    try {
      const r = await onConfirmar(conMotivo ? motivo : undefined);
      if (r.omitidos.length === 0) {
        toast.success(`${r.procesados} ${r.procesados === 1 ? hecho[0] : hecho[1]}`);
        onTerminado?.();
        onAbiertoChange(false);
      } else {
        setResultado(r);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (resultado) {
    // Los salteados se nombran con la selección: recién al cerrar se puede vaciar.
    const cerrar = () => {
      onTerminado?.();
      onAbiertoChange(false);
    };
    return (
      <Dialog
        abierto={abierto}
        onAbiertoChange={(v) => !v && cerrar()}
        titulo={titulo}
        descripcion={`${resultado.procesados} ${resultado.procesados === 1 ? hecho[0] : hecho[1]}. ${plural(resultado.omitidos.length, 'quedó afuera', 'quedaron afuera')}:`}
        pie={<Button onClick={cerrar}>Cerrar</Button>}
      >
        <ul className="flex max-h-80 flex-col overflow-y-auto rounded-control border border-borde">
          {resultado.omitidos.map((o) => (
            <li key={o.id} className="flex gap-3 border-b border-borde px-4 py-2.5 text-sm last:border-b-0">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-pend" />
              <span>
                <span className="font-semibold">{etiquetaDe(o.id)}</span>
                <span className="block text-tenue">{o.motivo}</span>
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      ancho="sm"
      descripcion={descripcion}
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button variante="peligro" cargando={cargando} onClick={() => void correr()}>
            {confirmar}
          </Button>
        </>
      }
    >
      {conMotivo && (
        <Field label="Motivo" htmlFor="motivo-lote" requerido error={error ?? undefined} ayuda="Queda registrado en cada uno.">
          <Textarea
            id="motivo-lote"
            autoFocus
            invalido={!!error}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
          />
        </Field>
      )}
    </Dialog>
  );
}
