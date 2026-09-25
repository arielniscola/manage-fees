import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ETIQUETA_PERIODICIDAD,
  PERIODICIDADES,
  etiquetaTramo,
  historialCrearSchema,
  mesActual,
  periodosEntre,
  pesos,
  sumarMeses,
  type HistorialCrear,
  type HistorialCrearInput,
  type Periodicidad,
  type SocioDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { nombreCompleto, plural } from '@/lib/formato';
import { useCargarHistorial } from './historial-api';

/**
 * Carga a mano del historial de un socio: un tramo de períodos de una parcela o de la
 * cuota social, todos por el mismo importe y en el mismo estado. Es la contracara de la
 * planilla, para arreglar un año suelto sin armar un archivo.
 */
export function CargarHistorialDialog({
  socio,
  abierto,
  onAbiertoChange,
}: {
  socio: SocioDetalle;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
}) {
  const cargar = useCargarHistorial(socio.id);
  const anteriores = { desde: sumarMeses(mesActual(), -12), hasta: sumarMeses(mesActual(), -1) };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<HistorialCrearInput, unknown, HistorialCrear>({
    resolver: zodResolver(historialCrearSchema),
    defaultValues: {
      parcelaId: socio.parcelas[0]?.id ?? null,
      desde: anteriores.desde,
      hasta: anteriores.hasta,
      periodicidad: 'MENSUAL',
      importe: '',
      pagada: true,
      fechaPago: '',
      diaVencimiento: 10,
    },
  });

  useEffect(() => {
    if (abierto) {
      reset({
        parcelaId: socio.parcelas[0]?.id ?? null,
        desde: anteriores.desde,
        hasta: anteriores.hasta,
        periodicidad: 'MENSUAL',
        importe: '',
        pagada: true,
        fechaPago: '',
        diaVencimiento: 10,
      });
    }
    // Las fechas por omisión se recalculan solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, socio.id, reset]);

  const desde = watch('desde');
  const hasta = watch('hasta');
  const periodicidad = (watch('periodicidad') ?? 'MENSUAL') as Periodicidad;
  const pagada = !!watch('pagada');
  const importe = String(watch('importe') ?? '');

  // Cuántas cuotas saldrían con lo que está escrito, para que no sea una sorpresa.
  const validos = /^\d{4}-\d{2}$/.test(desde ?? '') && /^\d{4}-\d{2}$/.test(hasta ?? '') && (hasta ?? '') >= (desde ?? '');
  const periodos = validos ? periodosEntre(desde!, hasta!, periodicidad, 241) : [];
  const centavos = Number(importe.replace(/\./g, '').replace(',', '.')) * 100;
  const total = Number.isFinite(centavos) && centavos > 0 ? Math.round(centavos) * periodos.length : 0;

  const onSubmit = handleSubmit((datos) =>
    cargar.mutate(datos, {
      onSuccess: (r) => {
        toast.success(
          `${plural(r.creadas, 'cuota cargada', 'cuotas cargadas')} ${r.pagada ? 'como pagadas' : 'como adeudadas'}` +
            (r.omitidas > 0 ? ` · ${plural(r.omitidas, 'período ya existía', 'períodos ya existían')}` : ''),
        );
        onAbiertoChange(false);
      },
      onError: (e) => {
        if (e instanceof ApiError && (e.field === 'desde' || e.field === 'parcelaId')) {
          setError(e.field as 'desde' | 'parcelaId', { message: e.message });
        } else toast.error(e.message);
      },
    }),
  );

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="sm"
      titulo="Cargar historial de cuotas"
      descripcion={`${nombreCompleto(socio)} · cuotas de antes de usar el sistema`}
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button form="form-historial" type="submit" cargando={cargar.isPending} disabled={periodos.length === 0}>
            Cargar {periodos.length > 0 ? plural(periodos.length, 'cuota') : ''}
          </Button>
        </>
      }
    >
      <form id="form-historial" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Qué cuota"
          htmlFor="historial-parcela"
          requerido
          error={errors.parcelaId?.message}
          ayuda="La social la paga por ser socio; la de parcela, por el terreno."
        >
          <Select id="historial-parcela" invalido={!!errors.parcelaId} {...register('parcelaId')}>
            <option value="">Cuota social</option>
            {socio.parcelas.map((p) => (
              <option key={p.id} value={p.id}>
                Parcela {p.etiqueta}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Desde" htmlFor="historial-desde" requerido error={errors.desde?.message}>
            <Input id="historial-desde" type="month" className="tabular" invalido={!!errors.desde} {...register('desde')} />
          </Field>
          <Field label="Hasta" htmlFor="historial-hasta" requerido error={errors.hasta?.message}>
            <Input id="historial-hasta" type="month" className="tabular" invalido={!!errors.hasta} {...register('hasta')} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Importe de cada cuota" htmlFor="historial-importe" requerido error={errors.importe?.message}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">$</span>
              <Input
                id="historial-importe"
                inputMode="decimal"
                className="pl-7 tabular"
                placeholder="12.000"
                invalido={!!errors.importe}
                {...register('importe')}
              />
            </div>
          </Field>
          <Field label="Periodicidad" htmlFor="historial-periodicidad" error={errors.periodicidad?.message}>
            <Select id="historial-periodicidad" {...register('periodicidad')}>
              {PERIODICIDADES.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PERIODICIDAD[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Cómo quedan</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors ${pagada ? 'border-pino-400 bg-pino-50' : 'border-borde hover:bg-superficie-2'}`}
            >
              <input type="radio" value="true" className="mt-0.5 size-4 accent-pino-600" {...register('pagada')} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Pagadas</span>
                <span className="text-[13px] text-tenue">No emiten recibo ni entran en la caja.</span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors ${!pagada ? 'border-pino-400 bg-pino-50' : 'border-borde hover:bg-superficie-2'}`}
            >
              <input type="radio" value="false" className="mt-0.5 size-4 accent-pino-600" {...register('pagada')} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Adeudadas</span>
                <span className="text-[13px] text-tenue">Suman a su deuda y acumulan mora.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {pagada && (
          <Field
            label="Fecha de pago"
            htmlFor="historial-fechaPago"
            error={errors.fechaPago?.message}
            ayuda="Opcional: cuándo las pagó, según el registro de la cooperativa."
          >
            <Input id="historial-fechaPago" type="date" className="tabular" {...register('fechaPago')} />
          </Field>
        )}

        <div className="rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue">
          {periodos.length === 0 ? (
            'Elegí un tramo de períodos válido.'
          ) : (
            <>
              Se cargan <b>{plural(periodos.length, 'cuota')}</b> de {etiquetaTramo(periodos[0], periodos[periodos.length - 1], periodicidad)}
              {total > 0 && (
                <>
                  , por <b className="tabular">{pesos(total)}</b> en total
                </>
              )}
              . Los períodos que ya tengan cuota se saltean.
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
