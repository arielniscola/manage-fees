import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  aCentavos,
  hoy,
  pesos,
  simularPlan,
  TOLERANCIA_VENCIDAS,
  type DeudaDeTransferencia,
  type ParcelaListItem,
  type SocioListItem,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useSocios } from '@/features/socios/api';
import { ApiError } from '@/lib/api';
import { fecha as formatoFecha, dni as formatoDni, iniciales, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce } from '@/lib/hooks';
import { useDeudaDeTransferencia, useTransferirParcela } from './api';

/**
 * Transfiere la posesión de una parcela del titular actual a otro socio. El candidato
 * natural es un suplente, así que la búsqueda arranca por ellos, pero se puede elegir
 * cualquier socio activo: un titular puede quedarse con un segundo lote.
 *
 * Una parcela con deuda no se entrega sin más: lo que queda impago es del titular que sale,
 * así que primero se refinancia en un plan suyo. El plan se firma y la parcela cambia de
 * manos en la misma transacción.
 */
export function TransferirDialog({ parcela, onCerrar }: { parcela: ParcelaListItem | null; onCerrar: () => void }) {
  const [destino, setDestino] = useState<SocioListItem | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState('');
  const [anticipo, setAnticipo] = useState('');
  const [cuotasDelPlan, setCuotasDelPlan] = useState('6');
  const [primerVencimiento, setPrimerVencimiento] = useState(hoy);
  const transferir = useTransferirParcela(parcela?.id ?? 0);
  const { data: deuda, isPending: cargandoDeuda } = useDeudaDeTransferencia(parcela?.id ?? null, fecha);

  useEffect(() => {
    if (parcela) {
      setDestino(null);
      setFecha(hoy());
      setMotivo('');
      setAnticipo('');
      setCuotasDelPlan('6');
      setPrimerVencimiento(hoy());
    }
  }, [parcela]);

  const hayDeuda = !!deuda && deuda.total > 0;
  const anticipoCentavos = Math.max(0, aCentavos(anticipo) ?? 0);
  const cantidadCuotas = Number(cuotasDelPlan);
  const anticipoExcesivo = hayDeuda && anticipoCentavos >= deuda.total;
  const planValido =
    !hayDeuda ||
    (cantidadCuotas >= 1 &&
      cantidadCuotas <= 60 &&
      !anticipoExcesivo &&
      /^\d{4}-\d{2}-\d{2}$/.test(primerVencimiento) &&
      primerVencimiento >= fecha);

  const simulacion =
    hayDeuda && planValido
      ? simularPlan({
          deudaTotal: deuda.total,
          anticipo: anticipoCentavos,
          cantidadCuotas,
          fecha,
          primerVencimiento,
        })
      : null;

  const enviar = () =>
    transferir.mutate(
      {
        aSocioId: destino!.id,
        fecha,
        motivo: motivo || null,
        ...(hayDeuda
          ? {
              plan: {
                cantidadCuotas,
                anticipo: anticipo || 0,
                primerVencimiento,
                toleranciaVencidas: TOLERANCIA_VENCIDAS,
                observaciones: `Deuda refinanciada al transferir la parcela ${parcela?.etiqueta ?? ''}`.trim(),
              },
            }
          : {}),
      },
      {
        onSuccess: (t) => {
          const movidas = t.cuotasMovidas > 0 ? ` · ${plural(t.cuotasMovidas, 'cuota futura', 'cuotas futuras')} a su nombre` : '';
          const plan = t.planFirmado ? ` · plan N° ${t.planFirmado} firmado con la deuda` : '';
          toast.success(`Parcela ${t.parcela.etiqueta} transferida a ${nombreCompleto(t.a)}${movidas}${plan}`);
          onCerrar();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo transferir'),
      },
    );

  return (
    <Dialog
      abierto={!!parcela}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={`Transferir la parcela ${parcela?.etiqueta ?? ''}`}
      descripcion={
        parcela?.titular
          ? `Hoy está a nombre de ${nombreCompleto(parcela.titular)}. Elegí quién la recibe.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button cargando={transferir.isPending} disabled={!destino || cargandoDeuda || !planValido} onClick={enviar}>
            {hayDeuda ? 'Firmar el plan y transferir' : 'Transferir'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {parcela?.titular && (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-borde bg-superficie-2 px-4 py-3 text-sm">
            <span className="font-medium">{nombreCompleto(parcela.titular)}</span>
            <ArrowRight className="size-4 text-tenue" />
            {destino ? (
              <span className="font-medium text-pino-600">{nombreCompleto(destino)}</span>
            ) : (
              <span className="text-tenue">elegí el socio que la recibe</span>
            )}
          </div>
        )}

        {destino ? (
          <>
            <div className="flex items-center gap-3 rounded-control border border-pino-200 bg-pino-50 px-4 py-3">
              <Avatar texto={iniciales(destino)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{nombreCompleto(destino)}</span>
                <span className="text-xs tabular text-tenue">
                  N° {destino.numero} · DNI {formatoDni(destino.dni)}
                </span>
              </span>
              <Button variante="secundario" tamanio="sm" onClick={() => setDestino(null)}>
                Cambiar
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha de la transferencia" htmlFor="fecha-transferencia" requerido>
                <Input
                  id="fecha-transferencia"
                  type="date"
                  className="tabular"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
            </div>
            {cargandoDeuda ? (
              <div className="h-20 animate-pulse rounded-control bg-superficie-2" />
            ) : (
              hayDeuda && <DeudaYPlan
                deuda={deuda}
                anticipo={anticipo}
                onAnticipo={setAnticipo}
                cuotas={cuotasDelPlan}
                onCuotas={setCuotasDelPlan}
                primerVencimiento={primerVencimiento}
                onPrimerVencimiento={setPrimerVencimiento}
                fecha={fecha}
                anticipoExcesivo={anticipoExcesivo}
                simulacion={simulacion}
              />
            )}

            <Field label="Motivo" htmlFor="motivo-transferencia" ayuda="Opcional. Queda en el historial de la parcela.">
              <Textarea
                id="motivo-transferencia"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por ejemplo: venta entre socios, cesión familiar"
                className="min-h-16"
              />
            </Field>

            <p className="rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue">
              Las cuotas de períodos ya empezados quedan con{' '}
              {parcela?.titular ? nombreCompleto(parcela.titular) : 'el titular saliente'}: eran suyas cuando se
              generaron. Las de períodos que todavía no arrancaron pasan a {nombreCompleto(destino)}, y las próximas se
              generan a su nombre.
            </p>
          </>
        ) : (
          <BuscadorDeSocio onElegir={setDestino} excluirId={parcela?.titular?.id} />
        )}
      </div>
    </Dialog>
  );
}

function DeudaYPlan({
  deuda,
  anticipo,
  onAnticipo,
  cuotas,
  onCuotas,
  primerVencimiento,
  onPrimerVencimiento,
  fecha,
  anticipoExcesivo,
  simulacion,
}: {
  deuda: DeudaDeTransferencia;
  anticipo: string;
  onAnticipo: (v: string) => void;
  cuotas: string;
  onCuotas: (v: string) => void;
  primerVencimiento: string;
  onPrimerVencimiento: (v: string) => void;
  fecha: string;
  anticipoExcesivo: boolean;
  simulacion: ReturnType<typeof simularPlan> | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-control border border-pend bg-pend-fondo/40 px-4 py-4">
      <div className="flex items-start gap-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        <AlertCircle className="text-pend" />
        <span>
          <b>La parcela debe {pesos(deuda.total)}</b> en {plural(deuda.cuotas.length, 'cuota impaga', 'cuotas impagas')}
          {deuda.vencidas > 0 && `, ${deuda.vencidas} ya vencidas`}. Es deuda de{' '}
          {nombreCompleto(deuda.socio)}, que sale: se refinancia en un plan suyo antes de entregar la parcela.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Anticipo" htmlFor="anticipo-transferencia" error={anticipoExcesivo ? 'Tiene que ser menor que la deuda' : undefined} ayuda={anticipoExcesivo ? undefined : 'Opcional'}>
          <Input
            id="anticipo-transferencia"
            inputMode="decimal"
            className="tabular"
            placeholder="0,00"
            value={anticipo}
            invalido={anticipoExcesivo}
            onChange={(e) => onAnticipo(e.target.value)}
          />
        </Field>
        <Field label="Cuotas" htmlFor="cuotas-transferencia" requerido>
          <Input
            id="cuotas-transferencia"
            type="number"
            min={1}
            max={60}
            className="tabular"
            value={cuotas}
            onChange={(e) => onCuotas(e.target.value)}
          />
        </Field>
        <Field label="Primer vencimiento" htmlFor="vence-transferencia" requerido error={primerVencimiento < fecha ? 'No puede ser anterior a la transferencia' : undefined}>
          <Input
            id="vence-transferencia"
            type="date"
            className="tabular"
            value={primerVencimiento}
            invalido={primerVencimiento < fecha}
            onChange={(e) => onPrimerVencimiento(e.target.value)}
          />
        </Field>
      </div>

      {simulacion && (
        <p className="text-[13px] text-tenue">
          {simulacion.anticipo > 0 && <>Anticipo de {pesos(simulacion.anticipo)} y </>}
          <span className="font-medium text-tinta">
            {simulacion.cuotas.filter((c) => c.numero > 0).length} cuotas de {pesos(simulacion.importeCuota)}
          </span>
          , la primera el {formatoFecha(primerVencimiento)}
          {simulacion.ultimoVencimiento && <> y la última el {formatoFecha(simulacion.ultimoVencimiento)}</>}.
        </p>
      )}
    </div>
  );
}

function BuscadorDeSocio({ onElegir, excluirId }: { onElegir: (s: SocioListItem) => void; excluirId?: number }) {
  const [texto, setTexto] = useState('');
  const [soloSuplentes, setSoloSuplentes] = useState(true);
  const q = useDebounce(texto);
  const { data } = useSocios({
    q: q || undefined,
    estado: soloSuplentes ? 'suplente' : 'activo',
    page: 1,
    pageSize: 8,
  });

  const candidatos = (data?.items ?? []).filter((s) => s.id !== excluirId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-destino"
            type="search"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, DNI o N° de socio"
            className="pl-10"
            aria-label="Buscar socio que recibe la parcela"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={soloSuplentes}
            onChange={(e) => setSoloSuplentes(e.target.checked)}
            className="size-4 accent-pino-600"
          />
          Solo suplentes
        </label>
      </div>

      <div className="flex flex-col gap-1">
        {!data ? (
          <p className="py-6 text-center text-sm text-tenue">Buscando…</p>
        ) : candidatos.length === 0 ? (
          <p className="py-6 text-center text-sm text-tenue">
            {soloSuplentes
              ? 'No hay suplentes que coincidan. Destildá «solo suplentes» para buscar entre todos los socios activos.'
              : 'No hay socios activos que coincidan.'}
          </p>
        ) : (
          candidatos.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onElegir(s)}
              className="flex items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-superficie-2"
            >
              <Avatar texto={iniciales(s)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{nombreCompleto(s)}</span>
                <span className="text-xs tabular text-tenue">
                  N° {s.numero} · DNI {formatoDni(s.dni)}
                  {s.parcelas.length > 0 && ` · ${plural(s.parcelas.length, 'parcela')}`}
                </span>
              </span>
              {s.tipo === 'SUPLENTE' ? (
                <Badge tono="pend">Suplente</Badge>
              ) : s.estadoCuenta.vencidas > 0 ? (
                <Badge tono="mor">{pesos(s.estadoCuenta.deudaVencida)}</Badge>
              ) : (
                <Badge tono="ok">Al día</Badge>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
