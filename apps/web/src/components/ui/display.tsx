import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tono = 'ok' | 'pend' | 'mor' | 'baja' | 'pino';

const tonos: Record<Tono, string> = {
  ok: 'bg-ok-fondo text-ok',
  pend: 'bg-pend-fondo text-pend',
  mor: 'bg-mor-fondo text-mor',
  baja: 'bg-baja-fondo text-baja',
  pino: 'bg-pino-50 text-pino-600',
};

export function Badge({ tono, children, punto = true }: { tono: Tono; children: ReactNode; punto?: boolean }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', tonos[tono])}>
      {punto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-card border border-borde bg-superficie', className)}>{children}</div>;
}

export function CardHeader({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-xl font-medium">{titulo}</h2>
        {descripcion && <p className="text-[13px] text-tenue">{descripcion}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Avatar({ texto, tamanio = 32 }: { texto: string; tamanio?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-pino-100 font-semibold text-pino-600"
      style={{ width: tamanio, height: tamanio, fontSize: Math.round(tamanio * 0.36) }}
    >
      {texto}
    </span>
  );
}

export function Chips<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { valor: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex gap-1.5 rounded-control border border-borde bg-superficie-2 p-1">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(o.valor)}
            className={cn(
              'h-[30px] rounded-[7px] border px-3 text-[13px] font-medium transition-colors',
              activo ? 'border-borde bg-superficie text-tinta shadow-[0_1px_2px_rgba(34,37,31,0.08)]' : 'border-transparent text-tenue hover:text-tinta',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap border-b border-borde bg-superficie-2 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-tenue', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b border-borde px-4 py-2.5 align-middle', className)}>{children}</td>;
}

export function Paginacion({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  const boton = 'inline-flex size-[34px] items-center justify-center rounded-lg border border-borde bg-superficie text-tinta disabled:opacity-40 disabled:cursor-not-allowed hover:bg-superficie-2';
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="text-[13px] text-tenue tabular">
        {total === 0 ? 'Sin resultados' : `Mostrando ${desde}–${hasta} de ${total.toLocaleString('es-AR')}`}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={boton} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-[13px] tabular text-tenue">
            {page} de {paginas}
          </span>
          <button type="button" className={boton} disabled={page >= paginas} onClick={() => onChange(page + 1)} aria-label="Página siguiente">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Vacio({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-serif text-xl">{titulo}</p>
      {descripcion && <p className="max-w-md text-sm text-tenue">{descripcion}</p>}
      {accion && <div className="pt-2">{accion}</div>}
    </div>
  );
}

export function FilasCargando({ columnas, filas = 6 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: columnas }, (_, j) => (
            <Td key={j}>
              <div className="h-4 animate-pulse rounded bg-superficie-2" style={{ width: `${50 + ((i + j) % 4) * 12}%` }} />
            </Td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-mor">{mensaje}</p>
      <button type="button" onClick={onReintentar} className="text-sm font-semibold text-pino-600 hover:underline">
        Reintentar
      </button>
    </div>
  );
}
