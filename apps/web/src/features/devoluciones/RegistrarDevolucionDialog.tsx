import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  devolucionCrearSchema,
  hoy,
  numeroDevolucion,
  numeroRecibo,
  pesos,
  type CobroDetalle,
  type DevolucionCrear,
  type DevolucionCrearInput,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { fecha, plural } from '@/lib/formato';
import { useMotivosDevolucion, useRegistrarDevolucion } from './api';

/**
 * Devuelve al socio el dinero de un cobro entero. Se elige una vez qué pasa con todas sus
 * cuotas; si el cobro tiene cuotas de un plan de pago, solo pueden volver a pendiente.
 */
export function RegistrarDevolucionDialog({ cobro, onCerrar }: { cobro: CobroDetalle | null; onCerrar: () => void }) {
  const registrar = useRegistrarDevolucion();
  const { data: motivos } = useMotivosDevolucion();
  const activos = (motivos ?? []).filter((m) => m.activo);
  const conPlan = !!cobro?.cuotas.some((c) => c.deUnPlan);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DevolucionCrearInput, unknown, DevolucionCrear>({ resolver: zodResolver(devolucionCrearSchema) });

  useEffect(() => {
    if (cobro) reset({ fecha: hoy(), medio: cobro.medio, motivoId: '' as unknown as number, detalle: '', destinoCuotas: 'PENDIENTE' });
  }, [cobro, reset]);

  const destino = watch('destinoCuotas');

  const onSubmit = handleSubmit((datos) =>
    registrar.mutate(
      { cobroId: cobro!.id, ...datos },
      {
        onSuccess: (d) => {
          toast.success(`Devolución N° ${numeroDevolucion(d.numero)} registrada.`);
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    ),
  );

  const opcion = (activa: boolean, deshabilitada = false) =>
    `flex items-start gap-3 rounded-control border px-4 py-3 transition-colors ${
      deshabilitada ? 'cursor-not-allowed border-borde opacity-60' : activa ? 'cursor-pointer border-pino-400 bg-pino-50' : 'cursor-pointer border-borde hover:bg-superficie-2'
    }`;

  return (
    <Dialog
      abierto={!!cobro}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo="Devolver dinero"
      descripcion={
        cobro
          ? `Recibo N° ${numeroRecibo(cobro.numeroRecibo)} del ${fecha(cobro.fecha)} por ${pesos(cobro.total)}. Se devuelve el cobro entero y se emite un comprobante de devolución.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button form="form-devolucion" type="submit" variante="peligro" cargando={registrar.isPending}>
            Registrar devolución
          </Button>
        </>
      }
    >
      <form id="form-devolucion" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha de la devolución" htmlFor="devolucion-fecha" requerido error={errors.fecha?.message}>
            <Input
              id="devolucion-fecha"
              type="date"
              min={cobro?.fecha}
              className="tabular"
              invalido={!!errors.fecha}
              {...register('fecha')}
            />
          </Field>
          <Field label="Medio de la devolución" htmlFor="devolucion-medio" requerido error={errors.medio?.message}>
            <Select id="devolucion-medio" invalido={!!errors.medio} {...register('medio')}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO_PAGO[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            Qué pasa con {cobro ? (cobro.cuotas.length === 1 ? 'la cuota' : `las ${plural(cobro.cuotas.length, 'cuota')}`) : 'las cuotas'}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={opcion(destino === 'PENDIENTE')}>
              <input type="radio" value="PENDIENTE" className="mt-0.5 size-4 accent-pino-600" {...register('destinoCuotas')} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Vuelven a pendiente</span>
                <span className="text-[13px] text-tenue">El socio las vuelve a deber.</span>
              </span>
            </label>
            <label className={opcion(destino === 'ANULADA', conPlan)}>
              <input
                type="radio"
                value="ANULADA"
                disabled={conPlan}
                className="mt-0.5 size-4 accent-pino-600"
                {...register('destinoCuotas')}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Quedan anuladas</span>
                <span className="text-[13px] text-tenue">
                  {conPlan ? 'No se puede: el cobro incluye cuotas de un plan de pago.' : 'Ya no se cobran.'}
                </span>
              </span>
            </label>
          </div>
          {errors.destinoCuotas && <span className="text-xs text-mor">{errors.destinoCuotas.message}</span>}
        </fieldset>

        <Field
          label="Motivo"
          htmlFor="devolucion-motivo"
          requerido
          error={errors.motivoId?.message}
          ayuda={motivos && activos.length === 0 ? 'No hay motivos cargados: agregalos desde «Motivos» en la vista de Devoluciones.' : undefined}
        >
          <Select id="devolucion-motivo" invalido={!!errors.motivoId} {...register('motivoId')}>
            <option value="">Elegí un motivo</option>
            {activos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Detalle" htmlFor="devolucion-detalle" error={errors.detalle?.message}>
          <Textarea
            id="devolucion-detalle"
            invalido={!!errors.detalle}
            placeholder="Opcional. Por ejemplo: pagó enero dos veces"
            {...register('detalle')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
