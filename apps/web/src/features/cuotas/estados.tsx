import { ETIQUETA_ESTADO_CUOTA, pesos, type EstadoCuenta, type EstadoCuotaVisible } from '@mf/shared';
import { Badge } from '@/components/ui/display';

const TONO: Record<EstadoCuotaVisible, 'ok' | 'pend' | 'mor' | 'baja' | 'pino'> = {
  pendiente: 'pend',
  vencida: 'mor',
  pagada: 'ok',
  anulada: 'baja',
  refinanciada: 'pino',
};

export function BadgeCuota({ estado, diasVencida }: { estado: EstadoCuotaVisible; diasVencida?: number }) {
  return (
    <Badge tono={TONO[estado]}>
      {ETIQUETA_ESTADO_CUOTA[estado]}
      {estado === 'vencida' && !!diasVencida && ` · ${diasVencida} d`}
    </Badge>
  );
}

/** Resumen de deuda para el listado de socios y la ficha. */
export function EstadoDeCuenta({ cuenta }: { cuenta: EstadoCuenta }) {
  if (cuenta.pendientes === 0) return <Badge tono="ok">Al día</Badge>;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tono={cuenta.vencidas > 0 ? 'mor' : 'pend'}>
        {cuenta.vencidas > 0 ? `${cuenta.vencidas} vencida${cuenta.vencidas === 1 ? '' : 's'}` : `${cuenta.pendientes} por vencer`}
      </Badge>
      <span className="text-xs tabular text-tenue">{pesos(cuenta.deuda)}</span>
    </div>
  );
}
