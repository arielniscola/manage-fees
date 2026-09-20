import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Ban, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_MEDIO_PAGO,
  cobroAnularSchema,
  numeroRecibo,
  pesos,
  type CobroAnularInput,
  type CobroDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { urlRecibo, useAnularCobro, useCobro } from './api';

const enlace =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4';

/** Detalle de un cobro: qué cuotas canceló, su recibo y la opción de anularlo. */
export function CobroDetalleDialog({ cobroId, onCerrar }: { cobroId: number | null; onCerrar: () => void }) {
  const { data: cobro, isPending, isError, error } = useCobro(cobroId);
  const [anulando, setAnulando] = useState(false);

  return (
    <>
      <Dialog
        abierto={!!cobroId}
        onAbiertoChange={(v) => !v && onCerrar()}
        titulo={cobro ? `Recibo N° ${numeroRecibo(cobro.numeroRecibo)}` : 'Cobro'}
        descripcion={cobro ? `${nombreCompleto(cobro.socio)} · N° ${cobro.socio.numero}` : undefined}
        pie={
          cobro && (
            <div className="flex flex-1 items-center justify-between gap-4">
              {cobro.anulado ? (
                <span className="text-sm text-tenue">Este cobro está anulado.</span>
              ) : (
                <Button variante="peligro" tamanio="sm" onClick={() => setAnulando(true)}>
                  <Ban /> Anular cobro
                </Button>
              )}
              <div className="flex items-center gap-3">
                <a href={urlRecibo(cobro.id, true)} className={enlace}>
                  <Download /> Descargar
                </a>
                <a
                  href={urlRecibo(cobro.id)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${enlace} border-pino-600 bg-pino-600 text-superficie hover:bg-pino-700`}
                >
                  <FileText /> Ver recibo
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
            {cobro.anulado && (
              <div className="rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor">
                <b>Cobro anulado</b>
                {cobro.anuladoEn && ` el ${fecha(cobro.anuladoEn.slice(0, 10))}`}
                {cobro.anuladoPor && ` por ${cobro.anuladoPor}`}. {cobro.motivoAnulacion}
                <span className="mt-1 block text-[13px]">
                  {plural(cobro.cuotas.length, 'cuota')} volvieron a pendiente.
                </span>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
              <Dato etiqueta="Fecha">{fecha(cobro.fecha)}</Dato>
              <Dato etiqueta="Medio">{ETIQUETA_MEDIO_PAGO[cobro.medio]}</Dato>
              <Dato etiqueta="Registró">{cobro.registradoPor}</Dato>
              <Dato etiqueta="Total">
                <span className="font-semibold">{pesos(cobro.total)}</span>
              </Dato>
            </dl>

            <div className="overflow-hidden rounded-control border border-borde">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Período</Th>
                    <Th>Parcela</Th>
                    <Th>Vencía</Th>
                    <Th className="text-right">Importe</Th>
                  </tr>
                </thead>
                <tbody>
                  {cobro.cuotas.map((c) => (
                    <tr key={c.cuotaId}>
                      <Td className="first-letter:uppercase">{c.etiqueta}</Td>
                      <Td className="font-semibold tabular">{c.parcela?.etiqueta ?? <span className="font-normal text-tenue">Plan de pago</span>}</Td>
                      <Td className="tabular text-tenue">{fecha(c.vencimiento)}</Td>
                      <Td className="text-right tabular">{pesos(c.importe)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-superficie-2 font-semibold">
                    <Td>Total</Td>
                    <Td />
                    <Td />
                    <Td className="text-right tabular">{pesos(cobro.total)}</Td>
                  </tr>
                </tbody>
              </Tabla>
            </div>

            {cobro.observaciones && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-tenue">Observaciones</span>
                <p className="text-sm">{cobro.observaciones}</p>
              </div>
            )}

            <Link to={`/socios/${cobro.socio.id}`} onClick={onCerrar} className="text-[13px] font-semibold text-pino-600 hover:underline">
              Ver la ficha del socio
            </Link>
          </div>
        )}
      </Dialog>

      <AnularCobroDialog cobro={anulando ? (cobro ?? null) : null} onCerrar={() => setAnulando(false)} />
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

export function AnularCobroDialog({ cobro, onCerrar }: { cobro: CobroDetalle | null; onCerrar: () => void }) {
  const anular = useAnularCobro();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CobroAnularInput>({ resolver: zodResolver(cobroAnularSchema) });

  useEffect(() => {
    if (cobro) reset({ motivo: '' });
  }, [cobro, reset]);

  const onSubmit = handleSubmit(({ motivo }) =>
    anular.mutate(
      { id: cobro!.id, motivo },
      {
        onSuccess: () => {
          toast.success('Cobro anulado. Las cuotas volvieron a pendiente.');
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    ),
  );

  return (
    <Dialog
      abierto={!!cobro}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Anular cobro"
      descripcion={
        cobro
          ? `Recibo N° ${numeroRecibo(cobro.numeroRecibo)} por ${pesos(cobro.total)}. El recibo queda marcado como anulado y sus ${plural(cobro.cuotas.length, 'cuota')} vuelven a pendiente.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button form="form-anular-cobro" type="submit" variante="peligro" cargando={anular.isPending}>
            Anular cobro
          </Button>
        </>
      }
    >
      <form id="form-anular-cobro" onSubmit={onSubmit} noValidate>
        <Field label="Motivo" htmlFor="motivo-cobro" requerido error={errors.motivo?.message}>
          <Textarea
            id="motivo-cobro"
            autoFocus
            invalido={!!errors.motivo}
            placeholder="Por ejemplo: se cargó al socio equivocado"
            {...register('motivo')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function BadgeCobro({ anulado }: { anulado: boolean }) {
  return anulado ? <Badge tono="baja">Anulado</Badge> : <Badge tono="ok">Vigente</Badge>;
}
