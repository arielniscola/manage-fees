import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Ban, CalendarDays, PlayCircle, RotateCcw, Search, Settings2, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  cuotaAnularSchema,
  ORDEN_CUOTAS,
  ORIGENES_CUOTA,
  pesos,
  type CuotaAnularInput,
  type CuotaListItem,
  type EstadoCuotaVisible,
  type OrigenCuota,
  type SocioResumen,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, ThOrden, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { AccionLoteDialog, BarraLote, CasillaFila, CasillaTodas, useSeleccion } from '@/components/ui/lotes';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl, useOrdenUrl } from '@/lib/hooks';
import { useYo } from '@/features/auth/api';
import { RegistrarPagoDialog } from '@/features/cobros/RegistrarPagoDialog';
import { useAnularCuota, useAnularCuotas, useCuotas, useEliminarCuotas, useEliminarHistoricas, useRegenerarCuota } from './api';
import { BadgeCuota } from './estados';
import { GenerarPeriodoDialog } from './GenerarPeriodoDialog';

type EstadoFiltro = EstadoCuotaVisible | 'impaga' | 'todas';
type OrigenFiltro = OrigenCuota | 'todos';
const PAGE_SIZE = 25;

export function CuotasPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('todas', loteoId);
  const orden = useOrdenUrl(filtros, ORDEN_CUOTAS, { columna: 'periodo', dir: 'desc' });
  const origenUrl = filtros.params.get('origen') as OrigenCuota | null;
  const origen: OrigenFiltro = origenUrl && ORIGENES_CUOTA.includes(origenUrl) ? origenUrl : 'todos';
  // Solo se mandan los valores completos: un input a medio escribir no filtra.
  const periodo = valorValido(filtros.params.get('periodo'), /^\d{4}-(0[1-9]|1[0-2])$/);
  const venceDesde = valorValido(filtros.params.get('venceDesde'), /^\d{4}-\d{2}-\d{2}$/);
  const venceHasta = valorValido(filtros.params.get('venceHasta'), /^\d{4}-\d{2}-\d{2}$/);
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [generar, setGenerar] = useState(false);
  const [anulando, setAnulando] = useState<CuotaListItem | null>(null);
  const [regenerando, setRegenerando] = useState<CuotaListItem | null>(null);
  // El socio se conserva al cerrar, para que el diálogo no cambie de contenido mientras se va.
  const [cobro, setCobro] = useState<{ abierto: boolean; socio: SocioResumen | null }>({ abierto: false, socio: null });
  const [lote, setLote] = useState<'anular' | 'eliminar' | 'historicas' | null>(null);
  const [quitarDeCobros, setQuitarDeCobros] = useState(false);
  const anularLote = useAnularCuotas();
  const eliminarLote = useEliminarCuotas();
  const eliminarHistoricas = useEliminarHistoricas();
  const { data: usuario } = useYo();
  const superadmin = usuario?.rol === 'SUPERADMIN';

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCuotas({
    q: filtros.q || undefined,
    estado: filtros.estado,
    origen: origen === 'todos' ? undefined : origen,
    periodo,
    venceDesde,
    venceHasta,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
    ...orden.query,
  });

  const porFecha = !!periodo || !!venceDesde || !!venceHasta;
  // Con un filtro de fecha puesto (por ejemplo, al volver con la URL) arranca visible.
  const [verFechas, setVerFechas] = useState(porFecha);
  const filtrando = !!filtros.q || filtros.estado !== 'todas' || origen !== 'todos' || porFecha;

  // Las impagas se pueden anular y las anuladas, borrar; las refinanciadas, nada. Las pagadas
  // tampoco, salvo las del historial para un superadmin, que las puede borrar si se cargaron mal.
  const seleccion = useSeleccion<CuotaListItem>({ q: filtros.q, estado: filtros.estado, origen, periodo, venceDesde, venceHasta, loteoId });
  const elegible = (c: CuotaListItem) => seAnula(c) || c.estado === 'anulada' || (superadmin && esHistoricaPagada(c));
  const elegibles = data?.items.filter(elegible) ?? [];
  const paraAnular = seleccion.elegidos.filter(seAnula);
  const paraEliminar = seleccion.elegidos.filter((c) => c.estado === 'anulada');
  const paraHistoricas = superadmin ? seleccion.elegidos.filter(esHistoricaPagada) : [];
  const enLote = lote === 'anular' ? paraAnular : lote === 'historicas' ? paraHistoricas : paraEliminar;

  return (
    <>
      <Encabezado
        antetitulo={data ? plural(data.total, 'cuota') : ' '}
        titulo="Cuotas"
        acciones={
          <>
            <Link
              to="/configuracion/cuota"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
            >
              <Settings2 /> Configurar cuota
            </Link>
            <Button onClick={() => setGenerar(true)}>
              <PlayCircle /> Generar período
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-cuota"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por socio, DNI, N° o parcela"
            className="pl-10"
            aria-label="Buscar cuota"
          />
        </div>
        <Chips
          etiqueta="Estado"
          valor={filtros.estado}
          onChange={(estado) => filtros.actualizar({ estado })}
          opciones={[
            { valor: 'todas', label: 'Todas' },
            { valor: 'impaga', label: 'Impagas' },
            { valor: 'vencida', label: 'Vencidas' },
            { valor: 'pendiente', label: 'Por vencer' },
            { valor: 'pagada', label: 'Pagadas' },
            { valor: 'anulada', label: 'Anuladas' },
            { valor: 'refinanciada', label: 'Refinanciadas' },
          ]}
        />
        <Chips
          etiqueta="Tipo"
          valor={origen}
          onChange={(o) => filtros.actualizar({ origen: o === 'todos' ? undefined : o })}
          opciones={[
            { valor: 'todos', label: 'Todas' },
            { valor: 'PARCELA', label: 'De parcela' },
            { valor: 'SOCIO', label: 'Sociales' },
            { valor: 'PLAN', label: 'De plan' },
            { valor: 'ANTICIPO', label: 'Anticipos' },
          ]}
        />
        <Button
          variante={verFechas || porFecha ? 'primario' : 'secundario'}
          aria-expanded={verFechas}
          aria-controls="filtros-fecha"
          onClick={() => setVerFechas((v) => !v)}
        >
          <CalendarDays /> Fechas
        </Button>
      </div>

      {verFechas && (
        <div id="filtros-fecha" className="flex flex-wrap items-end gap-3">
          <Field label="Mes" htmlFor="filtro-periodo" className="w-[180px]">
            <Input
              id="filtro-periodo"
              type="month"
              value={filtros.params.get('periodo') ?? ''}
              onChange={(e) => filtros.actualizar({ periodo: e.target.value })}
              className="tabular"
            />
          </Field>
          <Field label="Vence desde" htmlFor="filtro-vence-desde" className="w-[180px]">
            <Input
              id="filtro-vence-desde"
              type="date"
              value={filtros.params.get('venceDesde') ?? ''}
              max={venceHasta}
              onChange={(e) => filtros.actualizar({ venceDesde: e.target.value })}
              className="tabular"
            />
          </Field>
          <Field label="Vence hasta" htmlFor="filtro-vence-hasta" className="w-[180px]">
            <Input
              id="filtro-vence-hasta"
              type="date"
              value={filtros.params.get('venceHasta') ?? ''}
              min={venceDesde}
              onChange={(e) => filtros.actualizar({ venceHasta: e.target.value })}
              className="tabular"
            />
          </Field>
          {porFecha && (
            <Button
              variante="secundario"
              onClick={() => filtros.actualizar({ periodo: undefined, venceDesde: undefined, venceHasta: undefined })}
            >
              Limpiar fechas
            </Button>
          )}
        </div>
      )}

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          filtrando ? (
            <Vacio titulo="No hay cuotas que coincidan" descripcion="Probá con otro socio o parcela, o cambiá los filtros." />
          ) : (
            <Vacio
              titulo="Todavía no hay cuotas"
              descripcion="Configurá el valor de la cuota social y después generá el primer período."
              accion={
                <Button onClick={() => setGenerar(true)}>
                  <PlayCircle /> Generar período
                </Button>
              }
            />
          )
        ) : (
          <>
            <BarraLote cantidad={seleccion.cantidad} onLimpiar={seleccion.limpiar}>
              {paraAnular.length > 0 && (
                <Button variante="peligro" tamanio="sm" onClick={() => setLote('anular')}>
                  <Ban /> Anular {paraAnular.length}
                </Button>
              )}
              {paraEliminar.length > 0 && (
                <Button
                  variante="peligro"
                  tamanio="sm"
                  onClick={() => {
                    setQuitarDeCobros(false);
                    setLote('eliminar');
                  }}
                >
                  <Trash2 /> Eliminar {plural(paraEliminar.length, 'anulada')}
                </Button>
              )}
              {paraHistoricas.length > 0 && (
                <Button variante="peligro" tamanio="sm" onClick={() => setLote('historicas')}>
                  <Trash2 /> Eliminar {plural(paraHistoricas.length, 'pagada del historial', 'pagadas del historial')}
                </Button>
              )}
            </BarraLote>
            <Tabla>
              <thead>
                <tr>
                  <CasillaTodas items={elegibles} seleccion={seleccion} />
                  <ThOrden orden={orden} columna="periodo" primero="desc">
                    Período
                  </ThOrden>
                  <ThOrden orden={orden} columna="socio">
                    Socio
                  </ThOrden>
                  <ThOrden orden={orden} columna="parcela">
                    Parcela
                  </ThOrden>
                  <ThOrden orden={orden} columna="vencimiento">
                    Vence
                  </ThOrden>
                  <ThOrden orden={orden} columna="importe" primero="desc" className="text-right">
                    Importe
                  </ThOrden>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={8} />
                ) : (
                  data.items.map((c) => (
                    <tr key={c.id} className="hover:bg-superficie-2">
                      <CasillaFila item={c} seleccion={seleccion} etiqueta={`la cuota ${c.etiqueta}`} deshabilitada={!elegible(c)} />
                      <Td className="whitespace-nowrap font-medium first-letter:uppercase">
                        {c.etiqueta}
                        {c.historica && <span className="ml-1.5 text-xs font-normal normal-case text-tenue">(historial)</span>}
                      </Td>
                      <Td>
                        <Link to={`/socios/${c.socio.id}`} className="font-medium text-tinta hover:underline">
                          {nombreCompleto(c.socio)}
                        </Link>
                        <span className="block text-xs tabular text-tenue">N° {c.socio.numero}</span>
                      </Td>
                      <Td className="font-semibold tabular">
                        {c.parcela ? (
                          <div className="flex flex-col">
                            <span>{c.parcela.codigo}</span>
                            {c.parcela.sector && (
                              <span className="text-xs font-normal text-tenue">
                                {[c.parcela.sector.loteo?.nombre, c.parcela.sector.nombre].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-normal text-tenue">
                            {c.origen === 'SOCIO' ? 'Cuota social' : 'Plan de pago'}
                          </span>
                        )}
                      </Td>
                      <Td className="tabular">{fecha(c.vencimiento)}</Td>
                      <Td className="text-right tabular">{pesos(c.importe)}</Td>
                      <Td>
                        <BadgeCuota estado={c.estado} diasVencida={c.diasVencida} />
                      </Td>
                      <Td className="text-right">
                        {(c.estado === 'pendiente' || c.estado === 'vencida') && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variante="terciario"
                              tamanio="sm"
                              title={`Cobrar a ${nombreCompleto(c.socio)}`}
                              onClick={() => setCobro({ abierto: true, socio: c.socio })}
                            >
                              <Wallet /> Cobrar
                            </Button>
                            <button
                              type="button"
                              title={`Anular la cuota ${c.etiqueta}`}
                              aria-label={`Anular la cuota ${c.etiqueta}`}
                              onClick={() => setAnulando(c)}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-tenue transition-colors hover:bg-mor-fondo hover:text-mor [&_svg]:size-4"
                            >
                              <Ban />
                            </button>
                          </div>
                        )}
                        {seRegenera(c) && (
                          <Button
                            variante="terciario"
                            tamanio="sm"
                            title={`Volver a generar la cuota ${c.etiqueta}`}
                            onClick={() => setRegenerando(c)}
                          >
                            <RotateCcw /> Volver a generar
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Tabla>
            {data && (
              <Paginacion page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => filtros.actualizar({ page })} />
            )}
          </>
        )}
      </Card>

      <GenerarPeriodoDialog abierto={generar} onAbiertoChange={setGenerar} />
      <AnularCuotaDialog cuota={anulando} onCerrar={() => setAnulando(null)} />
      <RegenerarCuotaDialog cuota={regenerando} onCerrar={() => setRegenerando(null)} />
      <RegistrarPagoDialog abierto={cobro.abierto} onAbiertoChange={(abierto) => setCobro((v) => ({ ...v, abierto }))} socio={cobro.socio} />
      <AccionLoteDialog
        abierto={lote !== null}
        onAbiertoChange={(v) => !v && setLote(null)}
        titulo={lote === 'anular' ? 'Anular cuotas' : lote === 'historicas' ? 'Eliminar cuotas pagadas del historial' : 'Eliminar cuotas anuladas'}
        descripcion={
          lote === 'anular'
            ? `${plural(enLote.length, 'cuota impaga', 'cuotas impagas')}, ${pesos(enLote.reduce((t, c) => t + c.importe, 0))}. Dejan de contar en la deuda y la generación no las vuelve a crear.`
            : lote === 'historicas'
              ? `Se borran ${plural(enLote.length, 'cuota pagada', 'cuotas pagadas')} del historial, ${pesos(enLote.reduce((t, c) => t + c.importe, 0))}, y no se puede deshacer. El período queda libre: se puede volver a cargar bien y, si todavía corresponde, la próxima generación lo crea como impago.`
              : `Se borran ${plural(enLote.length, 'cuota anulada', 'cuotas anuladas')} y no se puede deshacer. Ojo: si el período todavía corresponde, la próxima generación lo vuelve a crear, porque la cuota anulada era la que lo impedía.`
        }
        confirmar={lote === 'anular' ? `Anular ${plural(enLote.length, 'cuota')}` : `Eliminar ${plural(enLote.length, 'cuota')}`}
        conMotivo={lote === 'anular'}
        cargando={anularLote.isPending || eliminarLote.isPending || eliminarHistoricas.isPending}
        onConfirmar={(motivo) => {
          const ids = enLote.map((c) => c.id);
          if (lote === 'anular') return anularLote.mutateAsync({ ids, motivo: motivo! });
          return lote === 'historicas' ? eliminarHistoricas.mutateAsync(ids) : eliminarLote.mutateAsync({ ids, quitarDeCobros });
        }}
        etiquetaDe={(id) => {
          const c = seleccion.elegidos.find((e) => e.id === id);
          return c ? `${c.etiqueta} · ${nombreCompleto(c.socio)}${c.parcela ? ` · ${c.parcela.etiqueta}` : ''}` : `Cuota ${id}`;
        }}
        hecho={lote === 'anular' ? ['cuota anulada', 'cuotas anuladas'] : ['cuota eliminada', 'cuotas eliminadas']}
        onTerminado={seleccion.limpiar}
      >
        {lote === 'eliminar' && (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-pino-600"
              checked={quitarDeCobros}
              onChange={(e) => setQuitarDeCobros(e.target.checked)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Quitarlas también de los cobros anulados</span>
              <span className="text-[13px] text-tenue">
                Una cuota que figura en un cobro anulado no se puede borrar. Con esto se la saca de ese cobro, y si el cobro
                queda vacío se elimina junto con su recibo. Los cobros vigentes no se tocan.
              </span>
            </span>
          </label>
        )}
      </AccionLoteDialog>
    </>
  );
}

const seAnula = (c: CuotaListItem) => c.estado === 'pendiente' || c.estado === 'vencida';
const esHistoricaPagada = (c: CuotaListItem) => c.historica && c.estado === 'pagada';
const seRegenera = (c: CuotaListItem) => c.estado === 'anulada' && (c.origen === 'PARCELA' || c.origen === 'SOCIO');

const valorValido = (valor: string | null, formato: RegExp): string | undefined =>
  valor && formato.test(valor) ? valor : undefined;

function AnularCuotaDialog({ cuota, onCerrar }: { cuota: CuotaListItem | null; onCerrar: () => void }) {
  const anular = useAnularCuota();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CuotaAnularInput>({ resolver: zodResolver(cuotaAnularSchema) });

  useEffect(() => {
    if (cuota) reset({ motivo: '' });
  }, [cuota, reset]);

  const onSubmit = handleSubmit(({ motivo }) =>
    anular.mutate(
      { id: cuota!.id, motivo },
      {
        onSuccess: () => {
          toast.success('Cuota anulada');
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    ),
  );

  return (
    <Dialog
      abierto={!!cuota}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Anular cuota"
      descripcion={
        cuota
          ? `${cuota.etiqueta}${cuota.parcela ? ` · parcela ${cuota.parcela.etiqueta}` : ''} · ${pesos(cuota.importe)}. Deja de contar en la deuda y la generación no la vuelve a crear.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button form="form-anular" type="submit" variante="peligro" cargando={anular.isPending}>
            Anular cuota
          </Button>
        </>
      }
    >
      <form id="form-anular" onSubmit={onSubmit} noValidate>
        <Field label="Motivo" htmlFor="motivo" requerido error={errors.motivo?.message}>
          <Textarea
            id="motivo"
            autoFocus
            invalido={!!errors.motivo}
            placeholder="Por ejemplo: generada por error, la parcela estaba liberada"
            {...register('motivo')}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function RegenerarCuotaDialog({ cuota, onCerrar }: { cuota: CuotaListItem | null; onCerrar: () => void }) {
  const regenerar = useRegenerarCuota();
  const confirmar = () =>
    regenerar.mutate(cuota!.id, {
      onSuccess: (nueva) => {
        toast.success(`Cuota generada a nombre de ${nombreCompleto(nueva.socio)}, por ${pesos(nueva.importe)}`);
        onCerrar();
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <Dialog
      abierto={!!cuota}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Volver a generar la cuota"
      descripcion={
        cuota
          ? `${cuota.etiqueta}${cuota.parcela ? ` · parcela ${cuota.parcela.etiqueta}` : ''}. Se borra la anulada y se crea de nuevo con el importe vigente${cuota.origen === 'PARCELA' ? ', a nombre del titular actual de la parcela' : ''}. Si figuraba en un cobro anulado, se la quita de ese cobro.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button cargando={regenerar.isPending} onClick={confirmar}>
            Volver a generar
          </Button>
        </>
      }
    />
  );
}
