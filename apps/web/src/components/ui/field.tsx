import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-control border bg-superficie px-3.5 text-sm text-tinta transition-shadow outline-none ' +
  'focus:border-pino-400 focus:ring-[3px] focus:ring-pino-400/25 disabled:bg-superficie-2 disabled:text-tenue';

const borde = (invalido?: boolean) => (invalido ? 'border-mor focus:border-mor focus:ring-mor/20' : 'border-borde');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(
  function Input({ invalido, className, ...props }, ref) {
    return <input ref={ref} aria-invalid={invalido || undefined} className={cn(control, 'h-10', borde(invalido), className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean }>(
  function Textarea({ invalido, className, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalido || undefined} className={cn(control, 'min-h-20 py-2.5', borde(invalido), className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean }>(
  function Select({ invalido, className, ...props }, ref) {
    return <select ref={ref} aria-invalid={invalido || undefined} className={cn(control, 'h-10 pr-8', borde(invalido), className)} {...props} />;
  },
);

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  ayuda?: string;
  requerido?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, ayuda, requerido, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-tinta">
        {label}
        {requerido && <span className="text-terracota"> *</span>}
      </label>
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1.5 text-xs text-mor">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        ayuda && <span className="text-xs text-tenue">{ayuda}</span>
      )}
    </div>
  );
}
