import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  configuracionInteresSchema,
  pesos,
  type ConfiguracionInteres,
  type ConfiguracionInteresGuardar,
  type ConfiguracionInteresInput,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorCarga } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useConfiguracionInteres, useGuardarConfiguracionInteres } from './api';

/** Cuota de ejemplo para la vista previa: $10.000. */
const EJEMPLO_IMPORTE = 1_000_000;

export function InteresPage() {
  const { data: config, isPending, isError, error, refetch } = useConfiguracionInteres();

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion" className="hover:underline">
              Configuración
            </Link>{' '}
            / Interés
          </>
        }
        titulo="Interés por mora"
      />

      {isError ? (
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      ) : isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-superficie" />
      ) : (
        <Formulario config={config} />
      )}
    </>
  );
}

function Formulario({ config }: { config: ConfiguracionInteres }) {
  const guardar = useGuardarConfiguracionInteres();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ConfiguracionInteresInput, unknown, ConfiguracionInteresGuardar>({
    resolver: zodResolver(configuracionInteresSchema),
    defaultValues: config,
  });

  useEffect(() => reset(config), [config, reset]);

  const activo = watch('activo');
  const porcentaje = Number(String(watch('porcentaje')).replace(',', '.'));
  const valido = !!activo && porcentaje > 0 && porcentaje <= 100;
  const mora = valido ? Math.round((EJEMPLO_IMPORTE * porcentaje) / 100) : 0;

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: () => toast.success('Interés guardado'),
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 px-7 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-xl font-medium">Cuánto se propone</h2>
          {config.activo ? <Badge tono="ok">Interés activo</Badge> : <Badge tono="baja">Interés apagado</Badge>}
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-pino-600" {...register('activo')} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Proponer interés por mora al cobrar</span>
            <span className="text-[13px] text-tenue">
              Con esto apagado las cuotas vencidas se cobran por su importe y no se les puede sumar mora.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Interés"
            htmlFor="porcentaje"
            requerido
            error={errors.porcentaje?.message}
            ayuda="Porcentaje sobre el importe de la cuota, una sola vez"
          >
            <div className="relative">
              <Input
                id="porcentaje"
                inputMode="decimal"
                className="pr-8 tabular"
                placeholder="5"
                invalido={!!errors.porcentaje}
                {...register('porcentaje')}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">%</span>
            </div>
          </Field>
        </div>

        <div className="flex items-start gap-2.5 rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <Info />
          <span>
            La mora <b>no se genera sola</b> ni se suma a la deuda que se muestra. Al registrar un pago o armar un plan,
            cada cuota vencida —desde el día siguiente a su vencimiento— trae este interés como un concepto aparte, y
            quien cobra puede cambiarle el importe o quitarlo. Lo que se cobre queda en su propio renglón del recibo.
            Solo alcanza a las cuotas de parcela: ni la cuota social, ni el anticipo de entrada, ni las cuotas de un
            plan de pago llevan mora.
          </span>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 px-7 py-6">
        <h2 className="font-serif text-xl font-medium">Cómo queda</h2>
        <p className="text-sm text-tenue">
          {valido ? (
            <>
              Al cobrar una cuota vencida de {pesos(EJEMPLO_IMPORTE)} se proponen{' '}
              <span className="font-medium tabular text-tinta">{pesos(mora)}</span> de interés por mora: en total,{' '}
              <span className="font-medium tabular text-tinta">{pesos(EJEMPLO_IMPORTE + mora)}</span>, por más tiempo
              que lleve vencida.
            </>
          ) : (
            'Con el interés apagado o en 0 % no se propone mora.'
          )}
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!isDirty || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {isDirty && (
          <Button type="button" variante="secundario" onClick={() => reset(config)}>
            Descartar
          </Button>
        )}
      </div>
    </form>
  );
}
