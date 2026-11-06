import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Ban, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_DESTINO_CUOTAS,
  ETIQUETA_MEDIO_PAGO,
  devolucionAnularSchema,
  numeroDevolucion,
  numeroRecibo,
  pesos,
  type DevolucionAnularInput,
  type DevolucionDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { urlRecibo } from '@/features/cobros/api';
import { urlComprobanteDevolucion, useAnularDevolucion, useDevolucion } from './api';

const enlace =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4';

/** Detalle de una devolución: de qué cobro, qué pasó con sus cuotas, el comprobante y la opción de anularla. */
export function DevolucionDetalleDialog({ devolucionId, onCerrar }: { devolucionId: number | null; onCerrar: () => void }) {
  const { data: d, isPending, isError, error } = useDevolucion(devolucionId);
  const [anulando, setAnulando] = useState(false);

  return (
    <>
      <Dialog
        abierto={!!devolucionId}
        onAbiertoChange={(v) => !v && onCerrar()}
        titulo={d ? `Devolución N° ${numeroDevolucion(d.numero)}` : 'Devolución'}
        descripcion={d ? `${nombreCompleto(d.socio)} · N° ${d.socio.numero}` : undefined}
        pie={
          d && (
            <div className="flex flex-1 items-center justify-between gap-4">
              {d.anulada ? (
                <span className="text-sm text-tenue">Esta devolución está anulada.</span>
              ) : (
                <Button variante="peligro" tamanio="sm" onClick={() => setAnulando(true)}>
                  <Ban /> Anular devolución
                </Button>
              )}
              <div className="flex items-center gap-3">
                <a href={urlComprobanteDevolucion(d.id, true)} className={enlace}>
                  <Download /> Descargar
                </a>
                <a
                  href={urlComprobanteDevolucion(d.id)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${enlace} border-pino-600 bg-pino-600 text-superficie hover:bg-pino-700`}
                >
                  <FileText /> Ver comprobante
                </a>
              </div>
            </div>
          )
        }
      >
        {isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-mor">{error.message}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {d.anulada && (
              <div className="rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor">
                <b>Devolución anulada</b>
                {d.anuladaEn && ` el ${fecha(d.anuladaEn.slice(0, 10))}`}
                {d.anuladaPor && ` por ${d.anuladaPor}`}. {d.motivoAnulacion}
                <span className="mt-1 block text-[13px]">{plural(d.cantidadCuotas, 'cuota')} volvieron a pagadas.</span>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
              <Dato etiqueta="Fecha">{fecha(d.fecha)}</Dato>
              <Dato etiqueta="Medio">{ETIQUETA_MEDIO_PAGO[d.medio]}</Dato>
              <Dato etiqueta="Registró">{d.registradoPor}</Dato>
              <Dato etiqueta="Importe">
                <span className="font-semibold">{pesos(d.importe)}</span>
              </Dato>
              <Dato etiqueta="Recibo devuelto">
                <a href={urlRecibo(d.cobro.id)} target="_blank" rel="noreferrer" className="font-semibold text-pino-600 hover:underline">
                  {numeroRecibo(d.cobro.numeroRecibo)}
                </a>
                <span className="block text-xs text-tenue">del {fecha(d.cobro.fecha)}</span>
              </Dato>
              <Dato etiqueta="Las cuotas">
                {plural(d.cantidadCuotas, 'cuota')}
                <span className="block text-xs text-tenue">{ETIQUETA_DESTINO_CUOTAS[d.destinoCuotas].toLowerCase()}</span>
              </Dato>
            </dl>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-tenue">Motivo</span>
              <p className="text-sm">{d.motivo}</p>
            </div>

            <Link to={`/socios/${d.socio.id}`} onClick={onCerrar} className="text-[13px] font-semibold text-pino-600 hover:underline">
              Ver la ficha del socio
            </Link>
          </div>
        )}
      </Dialog>

      <AnularDevolucionDialog devolucion={anulando ? (d ?? null) : null} onCerrar={() => setAnulando(false)} />
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-tenue">{etiqueta}</dt>
      <dd className="text-[15px] tabular">{children}</dd>
    </div>
  );
}

function AnularDevolucionDialog({ devolucion, onCerrar }: { devolucion: DevolucionDetalle | null; onCerrar: () => void }) {
  const anular = useAnularDevolucion();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DevolucionAnularInput>({ resolver: zodResolver(devolucionAnularSchema) });

  useEffect(() => {
    if (devolucion) reset({ motivo: '' });
  }, [devolucion, reset]);

  const onSubmit = handleSubmit(({ motivo }) =>
    anular.mutate(
      { id: devolucion!.id, motivo },
      {
        onSuccess: () => {
          toast.success('Devolución anulada. Las cuotas volvieron a pagadas.');
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    ),
  );

  return (
    <Dialog
      abierto={!!devolucion}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Anular devolución"
      descripcion={
        devolucion
          ? `Devolución N° ${numeroDevolucion(devolucion.numero)} por ${pesos(devolucion.importe)}. El comprobante queda marcado como anulado y las ${plural(devolucion.cantidadCuotas, 'cuota')} del recibo N° ${numeroRecibo(devolucion.cobro.numeroRecibo)} vuelven a pagadas.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button form="form-anular-devolucion" type="submit" variante="peligro" cargando={anular.isPending}>
            Anular devolución
          </Button>
        </>
      }
    >
      <form id="form-anular-devolucion" onSubmit={onSubmit} noValidate>
        <Field label="Motivo" htmlFor="motivo-devolucion" requerido error={errors.motivo?.message}>
          <Textarea
            id="motivo-devolucion"
            autoFocus
            invalido={!!errors.motivo}
            placeholder="Por ejemplo: se registró sobre el recibo equivocado"
            {...register('motivo')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function BadgeDevolucion({ anulada }: { anulada: boolean }) {
  return anulada ? <Badge tono="baja">Anulada</Badge> : <Badge tono="ok">Vigente</Badge>;
}
