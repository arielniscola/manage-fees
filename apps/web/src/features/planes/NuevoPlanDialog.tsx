import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  TOLERANCIA_VENCIDAS,
  aCentavos,
  hoy,
  numeroPlan,
  pesos,
  simularPlan,
  type CuotaListItem,
  type PlanDetalle,
  type SocioResumen,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useCuotasDeSocio } from '@/features/cuotas/api';
import { BadgeCuota } from '@/features/cuotas/estados';
import { useSocios } from '@/features/socios/api';
import { ApiError } from '@/lib/api';
import { dni as formatoDni, fecha, iniciales, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce } from '@/lib/hooks';
import { useCrearPlan } from './api';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  socio?: SocioResumen | null;
  onCreado?: (plan: PlanDetalle) => void;
}

/**
 * Arma un plan de pago: se eligen las cuotas impagas a refinanciar y el plan genera
 * cuotas nuevas por el mismo total. La simulación usa la misma función que la API,
 * así lo que se ve acá es exactamente lo que se guarda.
 */
export function NuevoPlanDialog({ abierto, onAbiertoChange, socio, onCreado }: Props) {
  const [elegido, setElegido] = useState<SocioResumen | null>(socio ?? null);
  const [creado, setCreado] = useState<PlanDetalle | null>(null);

  useEffect(() => {
    if (abierto) {
      setElegido(socio ?? null);
      setCreado(null);
    }
  }, [abierto, socio]);

  if (creado) {
    return (
      <Dialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        ancho="sm"
        titulo="Plan firmado"
        pie={
          <Button onClick={() => onAbiertoChange(false)}>
            Listo
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-ok" strokeWidth={1.5} />
          <p className="font-serif text-2xl">Plan N° {numeroPlan(creado.numero)}</p>
          <p className="text-sm text-tenue">
            {plural(creado.refinanciadas.length, 'cuota')} de {nombreCompleto(creado.socio)} por{' '}
            <span className="font-semibold text-tinta">{pesos(creado.deudaTotal)}</span>, refinanciadas en{' '}
            {plural(creado.cantidadCuotas, 'cuota')}.
          </p>
          <p className="text-[13px] text-tenue">
            Las cuotas del plan ya aparecen en «Registrar pago» como cualquier otra.
          </p>
        </div>
      </Dialog>
    );
  }

  if (!elegido) {
    return <ElegirMorosoDialog abierto={abierto} onAbiertoChange={onAbiertoChange} onElegir={setElegido} />;
  }

  return (
    <FormularioDePlan
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      socio={elegido}
      puedeCambiarSocio={!socio}
      onVolver={() => setElegido(null)}
      onCreado={(p) => {
        setCreado(p);
        onCreado?.(p);
      }}
    />
  );
}

function ElegirMorosoDialog({
  abierto,
  onAbiertoChange,
  onElegir,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onElegir: (s: SocioResumen) => void;
}) {
  const [texto, setTexto] = useState('');
  const q = useDebounce(texto);
  const { data } = useSocios({ q: q || undefined, estado: 'moroso', page: 1, pageSize: 8 });

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="sm"
      titulo="Nuevo plan de pago"
      descripcion="Elegí el socio moroso que va a refinanciar su deuda. Aparecen primero los que más deben."
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-moroso"
            type="search"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, DNI, N° de socio o parcela"
            className="pl-10"
            aria-label="Buscar socio moroso"
          />
        </div>

        <div className="flex flex-col gap-1">
          {!data ? (
            <p className="py-6 text-center text-sm text-tenue">Buscando…</p>
          ) : data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-tenue">
              {q ? 'No hay socios en mora que coincidan.' : 'No hay socios con cuotas vencidas.'}
            </p>
          ) : (
            data.items.map((s) => (
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
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <Badge tono="mor">{plural(s.estadoCuenta.vencidas, 'vencida')}</Badge>
                  <span className="text-xs tabular text-tenue">{pesos(s.estadoCuenta.deuda)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function FormularioDePlan({
  abierto,
  onAbiertoChange,
  socio,
  puedeCambiarSocio,
  onVolver,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  socio: SocioResumen;
  puedeCambiarSocio: boolean;
  onVolver: () => void;
  onCreado: (p: PlanDetalle) => void;
}) {
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [cantidadCuotas, setCantidadCuotas] = useState('6');
  const [anticipo, setAnticipo] = useState('');
  const [fechaPlan, setFechaPlan] = useState(hoy);
  const [primerVencimiento, setPrimerVencimiento] = useState('');
  const [tolerancia, setTolerancia] = useState(String(TOLERANCIA_VENCIDAS));
  const [observaciones, setObservaciones] = useState('');
  const crear = useCrearPlan();

  // Solo se refinancia deuda de cuota social; las de otro plan quedan afuera.
  const { data, isPending, isError, error } = useCuotasDeSocio(socio.id, 'impaga', { enabled: abierto });

  const refinanciables = useMemo(
    () =>
      [...(data ?? [])]
        // Se refinancia la deuda del período: la social y las de parcela. Las de otro plan no.
        .filter((c) => c.origen !== 'PLAN')
        .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento)),
    [data],
  );

  useEffect(() => {
    setSeleccion([]);
    setCantidadCuotas('6');
    setAnticipo('');
    setFechaPlan(hoy());
    setPrimerVencimiento(proximoMes(hoy()));
    setTolerancia(String(TOLERANCIA_VENCIDAS));
    setObservaciones('');
  }, [socio.id]);

  const elegidas = refinanciables.filter((c) => seleccion.includes(c.id));
  // Se refinancia la deuda del día: cada cuota entra con su interés por mora incluido,
  // que es lo que el servidor vuelve a calcular al crear el plan.
  const deudaTotal = elegidas.reduce((t, c) => t + c.importe + c.interes, 0);
  const anticipoCentavos = Math.max(0, aCentavos(anticipo) ?? 0);
  const cuotas = Math.max(0, Number(cantidadCuotas) || 0);

  const simulacion =
    deudaTotal > 0 && cuotas > 0 && anticipoCentavos < deudaTotal && /^\d{4}-\d{2}-\d{2}$/.test(primerVencimiento)
      ? simularPlan({ deudaTotal, anticipo: anticipoCentavos, cantidadCuotas: cuotas, fecha: fechaPlan, primerVencimiento })
      : null;

  const anticipoExcesivo = deudaTotal > 0 && anticipoCentavos >= deudaTotal;

  const alternar = (id: number) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const enviar = () =>
    crear.mutate(
      {
        socioId: socio.id,
        fecha: fechaPlan,
        cuotaIds: seleccion,
        cantidadCuotas: cuotas,
        anticipo: anticipo || 0,
        primerVencimiento,
        toleranciaVencidas: Number(tolerancia) || TOLERANCIA_VENCIDAS,
        observaciones: observaciones || null,
      },
      {
        onSuccess: (plan) => {
          toast.success(`Plan N° ${numeroPlan(plan.numero)} firmado`);
          onCreado(plan);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo armar el plan'),
      },
    );

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="lg"
      titulo="Nuevo plan de pago"
      descripcion={
        <>
          {nombreCompleto(socio)} · N° {socio.numero}
          {puedeCambiarSocio && (
            <>
              {' · '}
              <button type="button" onClick={onVolver} className="font-semibold text-pino-600 hover:underline">
                cambiar socio
              </button>
            </>
          )}
        </>
      }
      pie={
        <div className="flex flex-1 items-center justify-between gap-4">
          <span className="text-sm text-tenue">
            {simulacion ? (
              <>
                {plural(seleccion.length, 'cuota')} ·{' '}
                <span className="font-serif text-xl font-medium tabular text-tinta">{pesos(deudaTotal)}</span>
              </>
            ) : (
              'Elegí la deuda a refinanciar'
            )}
          </span>
          <div className="flex gap-3">
            <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button cargando={crear.isPending} disabled={!simulacion} onClick={enviar}>
              Firmar el plan
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {isError ? (
          <p className="py-6 text-center text-sm text-mor">{error.message}</p>
        ) : isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando la deuda…</p>
        ) : refinanciables.length === 0 ? (
          <p className="rounded-control bg-ok-fondo px-4 py-6 text-center text-sm text-ok">
            El socio no tiene cuotas sociales impagas para refinanciar.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-control border border-borde">
              <div className="flex items-center justify-between gap-4 border-b border-borde bg-superficie-2 px-4 py-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
                  <input
                    type="checkbox"
                    checked={seleccion.length === refinanciables.length}
                    onChange={() =>
                      setSeleccion(seleccion.length === refinanciables.length ? [] : refinanciables.map((c) => c.id))
                    }
                    className="size-4 accent-pino-600"
                  />
                  {seleccion.length === refinanciables.length ? 'Quitar todas' : `Refinanciar las ${refinanciables.length}`}
                </label>
                <span className="text-xs text-tenue">Solo cuotas sociales impagas</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                {refinanciables.map((c) => (
                  <FilaCuota key={c.id} cuota={c} marcada={seleccion.includes(c.id)} onAlternar={() => alternar(c.id)} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="En cuántas cuotas" htmlFor="cantidad-cuotas" requerido>
                <Input
                  id="cantidad-cuotas"
                  type="number"
                  min={1}
                  max={60}
                  className="tabular"
                  value={cantidadCuotas}
                  onChange={(e) => setCantidadCuotas(e.target.value)}
                />
              </Field>
              <Field
                label="Anticipo"
                htmlFor="anticipo"
                error={anticipoExcesivo ? 'Tiene que ser menor que la deuda' : undefined}
                ayuda={anticipoExcesivo ? undefined : 'Opcional'}
              >
                <Input
                  id="anticipo"
                  inputMode="decimal"
                  className="tabular"
                  placeholder="0,00"
                  invalido={anticipoExcesivo}
                  value={anticipo}
                  onChange={(e) => setAnticipo(e.target.value)}
                />
              </Field>
              <Field label="Fecha del plan" htmlFor="fecha-plan" requerido>
                <Input id="fecha-plan" type="date" className="tabular" value={fechaPlan} onChange={(e) => setFechaPlan(e.target.value)} />
              </Field>
              <Field label="Primer vencimiento" htmlFor="primer-vencimiento" requerido>
                <Input
                  id="primer-vencimiento"
                  type="date"
                  className="tabular"
                  value={primerVencimiento}
                  onChange={(e) => setPrimerVencimiento(e.target.value)}
                />
              </Field>
            </div>

            {simulacion && <Simulacion simulacion={simulacion} cantidadCuotas={cuotas} />}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <Field
                label="Cuotas vencidas"
                htmlFor="tolerancia"
                requerido
                ayuda="Cuántas lo dan por incumplido"
              >
                <Input
                  id="tolerancia"
                  type="number"
                  min={1}
                  max={12}
                  className="tabular"
                  value={tolerancia}
                  onChange={(e) => setTolerancia(e.target.value)}
                />
              </Field>
              <Field label="Observaciones" htmlFor="observaciones-plan">
                <Textarea
                  id="observaciones-plan"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Opcional"
                  className="min-h-16"
                />
              </Field>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function FilaCuota({ cuota, marcada, onAlternar }: { cuota: CuotaListItem; marcada: boolean; onAlternar: () => void }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-b border-borde px-4 py-2.5 text-sm last:border-b-0 ${marcada ? 'bg-pino-50' : 'hover:bg-superficie-2'}`}
    >
      <input type="checkbox" checked={marcada} onChange={onAlternar} className="size-4 accent-pino-600" />
      <span className="w-[140px] shrink-0 truncate font-semibold tabular">
        {cuota.parcela?.etiqueta ?? (cuota.origen === 'SOCIO' ? <span className="font-normal text-tenue">Social</span> : '—')}
      </span>
      <span className="min-w-0 flex-1 truncate first-letter:uppercase">{cuota.etiqueta}</span>
      <span className="w-[92px] shrink-0 tabular text-tenue">{fecha(cuota.vencimiento)}</span>
      <span className="w-[70px] shrink-0">
        <BadgeCuota estado={cuota.estado} />
      </span>
      <span className="flex w-[110px] shrink-0 flex-col items-end tabular">
        <span>{pesos(cuota.importe + cuota.interes)}</span>
        {cuota.interes > 0 && <span className="text-xs text-tenue">incluye {pesos(cuota.interes)} de interés</span>}
      </span>
    </label>
  );
}

function Simulacion({
  simulacion,
  cantidadCuotas,
}: {
  simulacion: ReturnType<typeof simularPlan>;
  cantidadCuotas: number;
}) {
  const financiadas = simulacion.cuotas.filter((c) => c.numero !== 0);
  const iguales = financiadas.every((c) => c.importe === financiadas[0]?.importe);

  return (
    <div className="flex flex-col gap-3 rounded-control border border-borde bg-superficie-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Así queda el plan</span>
        <span className="text-sm">
          {simulacion.anticipo > 0 && (
            <>
              Anticipo de <span className="font-semibold tabular">{pesos(simulacion.anticipo)}</span> +{' '}
            </>
          )}
          <span className="font-semibold tabular">
            {cantidadCuotas} {cantidadCuotas === 1 ? 'cuota' : 'cuotas'} de {pesos(simulacion.importeCuota)}
          </span>
          {!iguales && <span className="text-tenue"> (la última ajusta los centavos)</span>}
        </span>
      </div>

      <div className="max-h-[180px] overflow-y-auto overflow-x-auto rounded-control border border-borde bg-superficie">
        <Tabla>
          <thead>
            <tr>
              <Th>Cuota</Th>
              <Th>Vence</Th>
              <Th className="text-right">Importe</Th>
            </tr>
          </thead>
          <tbody>
            {simulacion.cuotas.map((c) => (
              <tr key={c.numero}>
                <Td className="font-medium">{c.numero === 0 ? 'Anticipo' : `Cuota ${c.numero} de ${cantidadCuotas}`}</Td>
                <Td className="tabular text-tenue">{fecha(c.vencimiento)}</Td>
                <Td className="text-right tabular">{pesos(c.importe)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </div>

      <p className="text-[13px] text-tenue">
        Las cuotas elegidas quedan refinanciadas y estas las reemplazan. Sin interés: el total del plan es el mismo{' '}
        <span className="font-semibold text-tinta">{pesos(simulacion.deudaTotal)}</span> de la deuda.
      </p>
    </div>
  );
}

/** Mismo día del mes siguiente, recortado si ese mes es más corto. */
function proximoMes(fechaISO: string): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const anio = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
