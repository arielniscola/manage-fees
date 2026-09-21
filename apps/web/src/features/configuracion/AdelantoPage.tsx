import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  configuracionAdelantoSchema,
  descuentoDeAdelanto,
  etiquetaPeriodo,
  mesActual,
  pesos,
  sumarMeses,
  MAX_MESES_ADELANTO,
  type ConfiguracionAdelanto,
  type ConfiguracionAdelantoGuardar,
  type ConfiguracionAdelantoInput,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorCarga } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { plural } from '@/lib/formato';
import { useConfiguracionAdelanto, useGuardarConfiguracionAdelanto } from './api';

/** Cuota de ejemplo para la vista previa: $10.000 por mes. */
const EJEMPLO_IMPORTE = 1_000_000;

export function AdelantoPage() {
  const { data: config, isPending, isError, error, refetch } = useConfiguracionAdelanto();

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion" className="hover:underline">
              Configuración
            </Link>{' '}
            / Adelanto
          </>
        }
        titulo="Pagos adelantados"
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

function Formulario({ config }: { config: ConfiguracionAdelanto }) {
  const guardar = useGuardarConfiguracionAdelanto();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ConfiguracionAdelantoInput, unknown, ConfiguracionAdelantoGuardar>({
    resolver: zodResolver(configuracionAdelantoSchema),
    defaultValues: config,
  });

  useEffect(() => reset(config), [config, reset]);

  const activo = !!watch('activo');
  const mesesMaximos = Number(watch('mesesMaximos'));
  const minimoMeses = Number(watch('minimoMeses'));
  const descuento = Number(String(watch('descuento')).replace(',', '.'));

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: () => toast.success('Pagos adelantados guardados'),
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 px-7 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-xl font-medium">Hasta cuándo se puede pagar</h2>
          {config.activo ? <Badge tono="ok">Adelanto activo</Badge> : <Badge tono="baja">Adelanto apagado</Badge>}
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-pino-600" {...register('activo')} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Permitir adelantar cuotas</span>
            <span className="text-[13px] text-tenue">
              Con esto apagado, registrar pago solo ofrece las cuotas que ya están generadas.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Se puede adelantar hasta"
            htmlFor="mesesMaximos"
            requerido
            error={errors.mesesMaximos?.message}
            ayuda={`Contados desde el mes en curso. Como mucho ${MAX_MESES_ADELANTO}.`}
          >
            <div className="relative">
              <Input
                id="mesesMaximos"
                type="number"
                min={1}
                max={MAX_MESES_ADELANTO}
                className="pr-16 tabular"
                invalido={!!errors.mesesMaximos}
                {...register('mesesMaximos')}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">
                meses
              </span>
            </div>
          </Field>
          <Field
            label="Descuento por adelantar"
            htmlFor="descuento"
            requerido
            error={errors.descuento?.message}
            ayuda="Porcentaje sobre el importe de cada cuota adelantada. 0 si no hay descuento."
          >
            <div className="relative">
              <Input
                id="descuento"
                inputMode="decimal"
                className="pr-8 tabular"
                placeholder="10"
                invalido={!!errors.descuento}
                {...register('descuento')}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">%</span>
            </div>
          </Field>
        </div>

        <Field
          label="El descuento corresponde desde"
          htmlFor="minimoMeses"
          requerido
          error={errors.minimoMeses?.message}
          ayuda="Adelantar menos meses que esto se cobra sin descuento."
        >
          <div className="relative sm:max-w-[calc(50%-8px)]">
            <Input
              id="minimoMeses"
              type="number"
              min={1}
              max={MAX_MESES_ADELANTO}
              className="pr-16 tabular"
              invalido={!!errors.minimoMeses}
              {...register('minimoMeses')}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">
              meses
            </span>
          </div>
        </Field>

        <div className="flex items-start gap-2.5 rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <Info />
          <span>
            Las cuotas futuras <b>no existen hasta que alguien las adelanta</b>: se crean y se cobran en el mismo
            recibo, así que nunca le figuran al socio como deuda ni le disparan avisos de vencimiento. Se cobran por la
            tarifa que rija en su período —si todavía no hay una cargada para ese mes, por la última vigente— y no
            devengan interés, porque se pagan antes de vencer. El descuento sale impreso en el recibo, cuota por cuota.
          </span>
        </div>
      </Card>

      <VistaPrevia activo={activo} mesesMaximos={mesesMaximos} minimoMeses={minimoMeses} descuento={descuento} />

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

/** Qué pagaría un socio con una cuota de $10.000 por mes, según lo que está escrito arriba. */
function VistaPrevia({
  activo,
  mesesMaximos,
  minimoMeses,
  descuento,
}: {
  activo: boolean;
  mesesMaximos: number;
  minimoMeses: number;
  descuento: number;
}) {
  const valido = activo && mesesMaximos >= 1 && minimoMeses >= 1 && descuento >= 0 && descuento <= 100;
  const desde = mesActual();
  const casos = [...new Set([1, 3, 6, 12, mesesMaximos])]
    .filter((m) => m >= 1 && m <= (valido ? mesesMaximos : 0))
    .sort((a, b) => a - b);

  return (
    <Card className="flex flex-col gap-4 px-7 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium">Cómo queda</h2>
        <p className="text-[13px] text-tenue">
          Un socio con una cuota mensual de {pesos(EJEMPLO_IMPORTE)}, adelantando desde{' '}
          {etiquetaPeriodo(sumarMeses(desde, 1), 'MENSUAL')}.
        </p>
      </div>

      {!valido ? (
        <p className="text-sm text-tenue">Con el adelanto apagado, registrar pago no ofrece cuotas futuras.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {casos.map((meses) => {
            const porCuota = descuentoDeAdelanto(
              EJEMPLO_IMPORTE,
              { activo: true, descuento, minimoMeses },
              meses,
            );
            const bruto = EJEMPLO_IMPORTE * meses;
            const ahorro = porCuota * meses;
            return (
              <li key={meses} className="flex items-baseline justify-between gap-4 text-sm tabular">
                <span className="text-tenue">
                  {plural(meses, 'mes', 'meses')} · hasta {etiquetaPeriodo(sumarMeses(desde, meses), 'MENSUAL')}
                </span>
                <span>
                  {ahorro > 0 && <span className="text-tenue">−{pesos(ahorro)} · </span>}
                  <span className="font-medium">{pesos(bruto - ahorro)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
