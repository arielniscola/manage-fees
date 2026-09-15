import type { ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg';
}

export function Dialog({ abierto, onAbiertoChange, titulo, descripcion, children, pie, ancho = 'md' }: DialogProps) {
  return (
    <D.Root open={abierto} onOpenChange={onAbiertoChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-pino-900/40" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-card border border-borde bg-superficie shadow-[0_24px_64px_rgba(18,36,25,0.18)] outline-none',
            { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[ancho],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div className="flex flex-col gap-1">
              <D.Title className="font-serif text-2xl font-medium">{titulo}</D.Title>
              {descripcion ? (
                <D.Description className="text-sm text-tenue">{descripcion}</D.Description>
              ) : (
                <D.Description className="sr-only">{titulo}</D.Description>
              )}
            </div>
            <D.Close className="-mr-2 rounded-lg p-2 text-tenue hover:bg-superficie-2 hover:text-tinta" aria-label="Cerrar">
              <X className="size-4" />
            </D.Close>
          </div>
          {children ? <div className="overflow-y-auto px-6 py-4">{children}</div> : <div className="pb-3" />}
          {pie && <div className="flex justify-end gap-3 border-t border-borde px-6 py-4">{pie}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
