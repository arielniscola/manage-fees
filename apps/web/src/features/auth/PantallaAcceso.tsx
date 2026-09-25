import type { ReactNode } from 'react';
import { LogoCooperativa } from '@/components/LogoCooperativa';

const NOMBRE_CLUB = import.meta.env.VITE_CLUB_NOMBRE || 'Gestión de socios';

/** Marco de las pantallas sin menú: ingreso y cambio obligatorio de contraseña. */
export function PantallaAcceso({ titulo, descripcion, children }: { titulo: string; descripcion?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-pino-700 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-control bg-superficie/12">
            <LogoCooperativa className="size-6 text-superficie" strokeWidth={1.6} />
          </span>
          <span className="font-serif text-xl text-superficie">{NOMBRE_CLUB}</span>
        </div>
        <p className="max-w-sm font-serif text-[34px] leading-tight text-superficie">
          Socios, parcelas y cuotas en un solo lugar.
        </p>
        <LogoCooperativa aria-hidden className="pointer-events-none absolute -bottom-16 -right-20 size-[420px] text-pino-600/60" strokeWidth={0.6} />
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="inline-flex size-10 items-center justify-center rounded-control bg-pino-700">
              <LogoCooperativa className="size-[22px] text-superficie" strokeWidth={1.6} />
            </span>
            <span className="font-serif text-lg">{NOMBRE_CLUB}</span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-4xl font-medium tracking-[-0.01em]">{titulo}</h1>
            {descripcion && <p className="text-[15px] leading-relaxed text-tenue">{descripcion}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
