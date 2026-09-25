import type { SVGProps } from 'react';

/**
 * Los dos pinos dentro de un círculo: el símbolo del cooperativismo. Trazo con el mismo
 * estilo que los íconos de lucide, así se acomoda a los mismos `className` y `strokeWidth`.
 */
export function LogoCooperativa({ strokeWidth = 1.6, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      {/* Pino izquierdo */}
      <path d="M8.5 5 5.5 10.5H7L5 15h7l-2-4.5h1.5Z" />
      <path d="M8.5 15v3" />
      {/* Pino derecho */}
      <path d="M15.5 5 12.5 10.5H14L12 15h7l-2-4.5h1.5Z" />
      <path d="M15.5 15v3" />
    </svg>
  );
}
