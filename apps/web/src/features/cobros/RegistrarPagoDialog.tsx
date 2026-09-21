import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FastForward, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  etiquetaPeriodo,
  hoy,
  mesActual,
  numeroRecibo,
  pesos,
  sumarMeses,
  totalesDeAdelanto,
  type CobroDetalle,
  type CuotaListItem,
  type MedioPago,
  type ResultadoAdelanto,
  type SocioResumen,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useConfiguracionAdelanto } from '@/features/configuracion/api';
import { useAdelantoPrevio, useCuotasDeSocio } from '@/features/cuotas/api';
import { BadgeCuota } from '@/features/cuotas/estados';
import { useSocios } from '@/features/socios/api';
import { ApiError } from '@/lib/api';
import { dni as formatoDni, fecha, iniciales, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce } from '@/lib/hooks';
import { urlRecibo, useRegistrarCobro } from './api';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  /** Si viene, el cobro es de ese socio; si no, el diálogo pide elegirlo primero. */
  socio?: SocioResumen | null;
}

/**
 * Registra el pago de una o varias cuotas. Las cuotas se pagan completas —no hay pagos
 * parciales— así que el total sale de las que se tildan.
 */
export function RegistrarPagoDialog({ abierto, onAbiertoChange, socio }: Props) {
  const [elegido, setElegido] = useState<SocioResumen | null>(socio ?? null);
  const [emitido, setEmitido] = useState<CobroDetalle | null>(null);

  useEffect(() => {
    if (abierto) {
      setElegido(socio ?? null);
      setEmitido(null);
    }
  }, [abierto, socio]);

  if (emitido) {
    return (
      <Dialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        ancho="sm"
        titulo="Pago registrado"
        pie={
          <>
            <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
              Cerrar
            </Button>
            <a
              href={urlRecibo(emitido.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-pino-600 bg-pino-600 px-[18px] text-sm font-semibold text-superficie transition-colors hover:bg-pino-700 [&_svg]:size-4"
            >
              <FileText /> Ver recibo
            </a>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-ok" strokeWidth={1.5} />
          <p className="font-serif text-2xl">Recibo N° {numeroRecibo(emitido.numeroRecibo)}</p>
          <p className="text-sm text-tenue">
            {plural(emitido.cuotas.length, 'cuota')} de {nombreCompleto(emitido.socio)} por{' '}
            <span className="font-semibold text-tinta">{pesos(emitido.total)}</span>, en{' '}
            {ETIQUETA_MEDIO_PAGO[emitido.medio].toLowerCase()}.
          </p>
          <a
            href={urlRecibo(emitido.id, true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-pino-600 hover:underline [&_svg]:size-4"
          >
            <Download /> Descargar el PDF
          </a>
        </div>
      </Dialog>
    );
  }

  if (!elegido) {
    return <ElegirSocioDialog abierto={abierto} onAbiertoChange={onAbiertoChange} onElegir={setElegido} />;
  }

  return (
    <FormularioDeCobro
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      socio={elegido}
      puedeCambiarSocio={!socio}
      onVolver={() => setElegido(null)}
      onEmitido={setEmitido}
    />
  );
}

function ElegirSocioDialog({
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
  const { data } = useSocios({ q: q || undefined, estado: 'activo', page: 1, pageSize: 8 });

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="sm"
      titulo="Registrar pago"
      descripcion="Buscá el socio que viene a pagar."
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-socio-cobro"
            type="search"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, DNI, N° de socio o parcela"
            className="pl-10"
            aria-label="Buscar socio"
          />
        </div>

        <div className="flex flex-col gap-1">
          {!data ? (
            <p className="py-6 text-center text-sm text-tenue">Buscando…</p>
          ) : data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-tenue">No hay socios activos que coincidan.</p>
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
                {s.estadoCuenta.pendientes > 0 ? (
                  <Badge tono={s.estadoCuenta.vencidas > 0 ? 'mor' : 'pend'}>{pesos(s.estadoCuenta.deuda)}</Badge>
                ) : (
                  <Badge tono="ok">Al día</Badge>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function FormularioDeCobro({
  abierto,
  onAbiertoChange,
  socio,
  puedeCambiarSocio,
  onVolver,
  onEmitido,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  socio: SocioResumen;
  puedeCambiarSocio: boolean;
  onVolver: () => void;
  onEmitido: (c: CobroDetalle) => void;
}) {
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [medio, setMedio] = useState<MedioPago>('EFECTIVO');
  const [fechaCobro, setFechaCobro] = useState(hoy);
  const [observaciones, setObservaciones] = useState('');
  // Meses que el socio se lleva pagos por adelantado. 0 = no adelanta nada.
  const [mesesAdelanto, setMesesAdelanto] = useState(0);
  // Renglones del adelanto que quedan afuera, por su clave: la social de un mes, la de
  // una parcela. Se vacía al cambiar de mes, porque la lista es otra.
  const [excluidas, setExcluidas] = useState<string[]>([]);
  const registrar = useRegistrarCobro();

  const { data, isPending, isError, error } = useCuotasDeSocio(socio.id, 'impaga', { enabled: abierto });
  const { data: reglas } = useConfiguracionAdelanto();
  const puedeAdelantar = !!reglas?.activo && reglas.mesesMaximos > 0;
  const adelantarHasta = mesesAdelanto > 0 ? sumarMeses(mesActual(), mesesAdelanto) : null;
  const adelanto = useAdelantoPrevio(socio.id, adelantarHasta, { enabled: abierto && puedeAdelantar });
  const previo = mesesAdelanto > 0 ? (adelanto.data ?? null) : null;
  const adelantado = totalesDeAdelanto(previo?.cuotas ?? [], excluidas);

  const elegirMeses = (n: number) => {
    setMesesAdelanto(n);
    setExcluidas([]);
  };

  // De la más vieja a la más nueva: primero se cancela la deuda más antigua.
  const impagas = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => a.vencimiento.localeCompare(b.vencimiento) || (a.parcela?.etiqueta ?? '').localeCompare(b.parcela?.etiqueta ?? ''),
      ),
    [data],
  );

  useEffect(() => {
    setSeleccion([]);
    setMedio('EFECTIVO');
    setFechaCobro(hoy());
    setObservaciones('');
    setMesesAdelanto(0);
    setExcluidas([]);
  }, [socio.id]);

  // Lo que se cobra es el importe más el interés por mora acumulado hasta hoy: el
  // servidor vuelve a calcularlo al registrar el pago y tiene que dar lo mismo.
  const deuda = impagas.filter((c) => seleccion.includes(c.id)).reduce((t, c) => t + c.importe + c.interes, 0);
  // Las adelantadas todavía no existen: su importe lo calcula el servidor en la vista
  // previa y lo vuelve a calcular al cobrar, así que tiene que dar lo mismo.
  const total = deuda + adelantado.total;
  const cantidad = seleccion.length + adelantado.cantidad;
  const alternar = (id: number) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const enviar = () =>
    registrar.mutate(
      {
        socioId: socio.id,
        fecha: fechaCobro,
        medio,
        cuotaIds: seleccion,
        adelantarHasta: adelantado.cantidad > 0 ? adelantarHasta : null,
        adelantarExcepto: excluidas,
        observaciones: observaciones || null,
      },
      {
        onSuccess: (cobro) => {
          toast.success(`Recibo N° ${numeroRecibo(cobro.numeroRecibo)} emitido`);
          onEmitido(cobro);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el pago'),
      },
    );

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="lg"
      titulo="Registrar pago"
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
            {cantidad === 0 ? (
              'Elegí las cuotas a cobrar'
            ) : (
              <>
                {plural(cantidad, 'cuota')}
                {adelantado.descuento > 0 && (
                  <span className="text-ok"> · −{pesos(adelantado.descuento)} de descuento</span>
                )}{' '}
                · <span className="font-serif text-xl font-medium tabular text-tinta">{pesos(total)}</span>
              </>
            )}
          </span>
          <div className="flex gap-3">
            <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button cargando={registrar.isPending} disabled={cantidad === 0 || adelanto.isFetching} onClick={enviar}>
              Cobrar y emitir recibo
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {isError ? (
          <p className="py-6 text-center text-sm text-mor">{error.message}</p>
        ) : isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando las cuotas…</p>
        ) : impagas.length === 0 ? (
          <p className="rounded-control bg-ok-fondo px-4 py-6 text-center text-sm text-ok">
            El socio no tiene cuotas pendientes. Está al día.
          </p>
        ) : (
          <TablaDeCuotas
            cuotas={impagas}
            seleccion={seleccion}
            onAlternar={alternar}
            onTodas={() => setSeleccion(seleccion.length === impagas.length ? [] : impagas.map((c) => c.id))}
          />
        )}

        {puedeAdelantar && (
          <Adelanto
            meses={mesesAdelanto}
            onMeses={elegirMeses}
            mesesMaximos={reglas.mesesMaximos}
            previo={previo}
            excluidas={excluidas}
            onAlternar={(clave) =>
              setExcluidas((e) => (e.includes(clave) ? e.filter((x) => x !== clave) : [...e, clave]))
            }
            cargando={adelanto.isFetching}
            error={adelanto.isError ? adelanto.error.message : null}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Medio de pago" htmlFor="medio" requerido>
            <Select id="medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO_PAGO[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha del pago" htmlFor="fecha-cobro" requerido>
            <Input id="fecha-cobro" type="date" className="tabular" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} />
          </Field>
        </div>
        <Field label="Observaciones" htmlFor="observaciones-cobro" ayuda="Salen impresas en el recibo.">
          <Textarea
            id="observaciones-cobro"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
            className="min-h-16"
          />
        </Field>
      </div>
    </Dialog>
  );
}

function TablaDeCuotas({
  cuotas,
  seleccion,
  onAlternar,
  onTodas,
}: {
  cuotas: CuotaListItem[];
  seleccion: number[];
  onAlternar: (id: number) => void;
  onTodas: () => void;
}) {
  const todas = seleccion.length === cuotas.length;
  return (
    <div className="overflow-hidden rounded-control border border-borde">
      <div className="flex items-center justify-between gap-4 border-b border-borde bg-superficie-2 px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
          <input type="checkbox" checked={todas} onChange={onTodas} className="size-4 accent-pino-600" />
          {todas ? 'Quitar todas' : `Seleccionar las ${cuotas.length}`}
        </label>
        <span className="text-xs text-tenue">De la más vieja a la más nueva</span>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {cuotas.map((c) => {
          const marcada = seleccion.includes(c.id);
          return (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center gap-3 border-b border-borde px-4 py-2.5 text-sm last:border-b-0 ${marcada ? 'bg-pino-50' : 'hover:bg-superficie-2'}`}
            >
              <input type="checkbox" checked={marcada} onChange={() => onAlternar(c.id)} className="size-4 accent-pino-600" />
              <span className="w-[74px] shrink-0 font-semibold tabular">
                {c.parcela?.etiqueta ?? (
                  <span className="font-normal text-tenue">{c.origen === 'SOCIO' ? 'Social' : 'Plan'}</span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate first-letter:uppercase">{c.etiqueta}</span>
              <span className="w-[92px] shrink-0 tabular text-tenue">{fecha(c.vencimiento)}</span>
              <span className="w-[70px] shrink-0">
                <BadgeCuota estado={c.estado} />
              </span>
              <span className="flex w-[110px] shrink-0 flex-col items-end tabular">
                <span>{pesos(c.importe + c.interes)}</span>
                {c.interes > 0 && <span className="text-xs text-tenue">incluye {pesos(c.interes)} de interés</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Adelantar cuotas: el socio se lleva pagos los períodos que todavía no se generaron.
 * La vista previa la calcula el servidor —acá no se inventan importes— y las cuotas
 * recién nacen cuando se registra el cobro.
 */
function Adelanto({
  meses,
  onMeses,
  mesesMaximos,
  previo,
  excluidas,
  onAlternar,
  cargando,
  error,
}: {
  meses: number;
  onMeses: (n: number) => void;
  mesesMaximos: number;
  previo: ResultadoAdelanto | null;
  excluidas: string[];
  onAlternar: (clave: string) => void;
  cargando: boolean;
  error: string | null;
}) {
  const desde = mesActual();
  const opciones = Array.from({ length: mesesMaximos }, (_, i) => i + 1);
  const incluido = totalesDeAdelanto(previo?.cuotas ?? [], excluidas);

  return (
    <div className="flex flex-col gap-3 rounded-control border border-borde px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold [&_svg]:size-4 [&_svg]:text-pino-600">
          <FastForward strokeWidth={1.8} /> Adelantar cuotas
        </span>
        <label className="flex items-center gap-2 text-[13px] text-tenue" htmlFor="adelantar-hasta">
          Dejar pago hasta
          <Select
            id="adelantar-hasta"
            value={meses}
            onChange={(e) => onMeses(Number(e.target.value))}
            className="h-9 w-auto min-w-[168px] text-sm"
          >
            <option value={0}>No adelantar</option>
            {opciones.map((n) => (
              <option key={n} value={n}>
                {etiquetaPeriodo(sumarMeses(desde, n), 'MENSUAL')}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {meses === 0 ? (
        <p className="text-[13px] text-tenue">
          Las cuotas de los períodos que todavía no se generaron se crean y se cobran en este mismo recibo.
        </p>
      ) : error ? (
        <p className="text-[13px] text-mor">{error}</p>
      ) : cargando || !previo ? (
        <p className="text-[13px] text-tenue">Calculando las cuotas a adelantar…</p>
      ) : previo.cuotas.length === 0 ? (
        <p className="text-[13px] text-tenue">
          No hay nada para adelantar hasta ese mes: esas cuotas ya están generadas y figuran arriba.
        </p>
      ) : (
        <>
          <div className="max-h-[168px] overflow-y-auto rounded-control bg-superficie-2">
            {previo.cuotas.map((c) => {
              const fuera = excluidas.includes(c.clave);
              return (
                <label
                  key={c.clave}
                  className={`flex cursor-pointer items-center gap-3 border-b border-borde px-3 py-2 text-sm last:border-b-0 ${fuera ? 'text-tenue line-through decoration-borde' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={!fuera}
                    onChange={() => onAlternar(c.clave)}
                    className="size-4 accent-pino-600"
                  />
                  <span className="w-[74px] shrink-0 font-semibold tabular">
                    {c.parcela?.etiqueta ?? <span className="font-normal text-tenue">Social</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate first-letter:uppercase">{c.etiqueta}</span>
                  <span className="w-[92px] shrink-0 tabular text-tenue">{fecha(c.vencimiento)}</span>
                  <span className="flex w-[110px] shrink-0 flex-col items-end tabular">
                    <span>{pesos(c.importe - c.descuento)}</span>
                    {c.descuento > 0 && <span className="text-xs text-tenue no-underline">antes {pesos(c.importe)}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[13px] text-tenue">
            {incluido.cantidad === 0 ? (
              'Sacaste todas: no se adelanta ninguna cuota.'
            ) : (
              <>
                {plural(incluido.cantidad, 'cuota')} de {plural(previo.meses, 'mes', 'meses')}
                {previo.conDescuento ? (
                  <>
                    {' '}
                    · <span className="font-semibold text-ok">{previo.porcentaje} % de descuento</span> (−
                    {pesos(incluido.descuento)})
                  </>
                ) : previo.porcentaje > 0 ? (
                  <> · el descuento corresponde desde los {previo.minimoMeses} meses</>
                ) : null}{' '}
                · <span className="font-semibold text-tinta tabular">{pesos(incluido.total)}</span>
              </>
            )}
          </p>
          <p className="text-[13px] text-tenue">
            Destildá la que no quiera pagar —la social de un mes, la de una parcela—: esa se va a generar como
            siempre cuando llegue su período.
          </p>
        </>
      )}
    </div>
  );
}
