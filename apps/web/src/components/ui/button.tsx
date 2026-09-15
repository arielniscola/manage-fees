import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variante = 'primario' | 'secundario' | 'terciario' | 'peligro';

const variantes: Record<Variante, string> = {
  primario: 'bg-pino-600 text-superficie border-pino-600 hover:bg-pino-700 hover:border-pino-700',
  secundario: 'bg-superficie text-tinta border-borde hover:bg-superficie-2',
  terciario: 'bg-transparent text-pino-600 border-transparent hover:bg-pino-50 px-2.5',
  peligro: 'bg-mor-fondo text-mor border-mor-fondo hover:border-mor/30',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanio?: 'md' | 'sm';
  cargando?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', tamanio = 'md', cargando, disabled, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
        tamanio === 'md' ? 'h-10 px-[18px] text-sm' : 'h-[34px] px-3.5 text-[13px]',
        variantes[variante],
        className,
      )}
      {...props}
    >
      {cargando && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});
