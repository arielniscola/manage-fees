import { useEffect, useState } from 'react';
import { Ban, CalendarDays, FileText, Plus, Search, Trash2 } from 'lucide-react';
import {
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  ORDEN_COBROS,
  hoy,
  inicioDelMes,
  numeroRecibo,
  pesos,
  type CobroListItem,
  type MedioPago,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, ThOrden, Vacio } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/field';
import { AccionLoteDialog, BarraLote, CasillaFila, CasillaTodas, useSeleccion } from '@/components/ui/lotes';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl, useOrdenUrl } from '@/lib/hooks';
import { urlRecibo, useAnularCobros, useCobros, useEliminarCobros } from './api';
import { BadgeCobro, CobroDetalleDialog } from './CobroDetalleDialog';
import { RegistrarPagoDialog } from './RegistrarPagoDialog';

type EstadoFiltro = 'vigentes' | 'anulados' | 'todos';
const PAGE_SIZE = 25;

export function CobrosPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('vigentes', loteoId);
  const orden = useOrdenUrl(filtros, ORDEN_COBROS, { columna: 'fecha', dir: 'desc' });
  const medioUrl = filtros.params.get('medio') as MedioPago | null;
  const medio = medioUrl && MEDIOS_PAGO.includes(medioUrl) ? medioUrl : undefined;
  // Solo se mandan las fechas completas: un input a medio escribir no filtra.
  const desde = valorValido(filtros.params.get('desde'));
  const hasta = valorValido(filtros.params.get('hasta'));
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);
  const [lote, setLote] = useState<'anular' | 'eliminar' | null>(null);
  const anularLote = useAnularCobros();
  const eliminarLote = useEliminarCobros();

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCobros({
    q: filtros.q || undefined,
    estado: filtros.estado,
    medio,
    desde,
    hasta,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
    ...orden.query,
  });

  const porFecha = !!desde || !!hasta;
  // Con un filtro de fecha puesto (por ejemplo, al volver con la URL) arranca visible.
  const [verFechas, setVerFechas] = useState(porFecha);
  const filtrando = !!filtros.q || filtros.estado !== 'vigentes' || !!medio || porFecha;
  const rango = (d: string, h: string) => filtros.actualizar({ desde: d, hasta: h });

  // Los vigentes se anulan; los anulados se pueden borrar.
  const seleccion = useSeleccion<CobroListItem>({ q: filtros.q, estado: filtros.estado, medio, desde, hasta, loteoId });
  const paraAnular = seleccion.elegidos.filter((c) => !c.anulado);
  const paraEliminar = seleccion.elegidos.filter((c) => c.anulado);
  const enLote = lote === 'anular' ? paraAnular : paraEliminar;

  return (
    <>
      <Encabezado
        antetitulo={data ? `${plural(data.resumen.cobros, 'cobro')} · ${pesos(data.resumen.total)}` : ' '}
        titulo="Cobros"
        acciones={
          <Button onClick={() => setRegistrando(true)}>
            <Plus /> Registrar pago
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-cobro"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por socio, DNI, parcela o N° de recibo"
            className="pl-10"
            aria-label="Buscar cobro"
          />
        </div>
        {/* Estado y medio van juntos: al achicarse la pantalla bajan de línea los dos. */}
        <div className="flex items-center gap-3">
          <Chips
            etiqueta="Estado"
            valor={filtros.estado}
            onChange={(estado) => filtros.actualizar({ estado })}
            opciones={[
              { valor: 'vigentes', label: 'Vigentes' },
              { valor: 'anulados', label: 'Anulados' },
              { valor: 'todos', label: 'Todos' },
            ]}
          />
          {/* El ancho va en el contenedor: Select ya trae w-full y cn no resuelve el choque de clases. */}
          <div className="w-[170px] shrink-0">
            <Select
              aria-label="Medio de pago"
              value={medio ?? ''}
              onChange={(e) => filtros.actualizar({ medio: e.target.value || undefined })}
            >
              <option value="">Todos los medios</option>
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO_PAGO[m]}
                </option>
              ))}
            </Select>
          </div>
        </div>
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
          <Field label="Desde" htmlFor="filtro-desde" className="w-[180px]">
            <Input
              id="filtro-desde"
              type="date"
              value={filtros.params.get('desde') ?? ''}
              max={hasta}
              onChange={(e) => filtros.actualizar({ desde: e.target.value })}
              className="tabular"
            />
          </Field>
          <Field label="Hasta" htmlFor="filtro-hasta" className="w-[180px]">
            <Input
              id="filtro-hasta"
              type="date"
              value={filtros.params.get('hasta') ?? ''}
              min={desde}
              onChange={(e) => filtros.actualizar({ hasta: e.target.value })}
              className="tabular"
            />
          </Field>
          <Button variante="secundario" onClick={() => rango(hoy(), hoy())}>
            Hoy
          </Button>
          <Button variante="secundario" onClick={() => rango(inicioDelMes(), hoy())}>
            Este mes
          </Button>
          {porFecha && (
            <Button variante="terciario" onClick={() => filtros.actualizar({ desde: undefined, hasta: undefined })}>
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
            <Vacio titulo="No hay cobros que coincidan" descripcion="Probá con otro socio o número de recibo, o cambiá los filtros." />
          ) : (
            <Vacio
              titulo="Todavía no hay cobros"
              descripcion="Registrá el primer pago y el sistema emite el recibo."
              accion={
                <Button onClick={() => setRegistrando(true)}>
                  <Plus /> Registrar pago
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
                <Button variante="peligro" tamanio="sm" onClick={() => setLote('eliminar')}>
                  <Trash2 /> Eliminar {plural(paraEliminar.length, 'anulado')}
                </Button>
              )}
            </BarraLote>
            <Tabla>
              <thead>
                <tr>
                  <CasillaTodas items={data?.items ?? []} seleccion={seleccion} />
                  <ThOrden orden={orden} columna="recibo" primero="desc">
                    Recibo
                  </ThOrden>
                  <ThOrden orden={orden} columna="fecha" primero="desc">
                    Fecha
                  </ThOrden>
                  <ThOrden orden={orden} columna="socio">
                    Socio
                  </ThOrden>
                  <ThOrden orden={orden} columna="cuotas" primero="desc">
                    Cuotas
                  </ThOrden>
                  <Th>Medio</Th>
                  <ThOrden orden={orden} columna="total" primero="desc" className="text-right">
                    Total
                  </ThOrden>
                  <Th>Estado</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={9} />
                ) : (
                  data.items.map((c) => (
                    <tr key={c.id} onClick={() => setDetalle(c.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
                      <CasillaFila item={c} seleccion={seleccion} etiqueta={`el recibo ${numeroRecibo(c.numeroRecibo)}`} />
                      <Td className="font-semibold tabular">{numeroRecibo(c.numeroRecibo)}</Td>
                      <Td className="tabular">{fecha(c.fecha)}</Td>
                      <Td>
                        <span className="font-medium">{nombreCompleto(c.socio)}</span>
                        <span className="block text-xs tabular text-tenue">N° {c.socio.numero}</span>
                      </Td>
                      <Td className="tabular text-tenue">{c.cantidadCuotas}</Td>
                      <Td>{ETIQUETA_MEDIO_PAGO[c.medio]}</Td>
                      <Td className={`text-right tabular ${c.anulado ? 'text-tenue line-through' : 'font-semibold'}`}>
                        {pesos(c.total)}
                      </Td>
                      <Td>
                        <BadgeCobro anulado={c.anulado} />
                      </Td>
                      <Td className="text-right">
                        <a
                          href={urlRecibo(c.id)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Ver el recibo N° ${numeroRecibo(c.numeroRecibo)}`}
                          aria-label={`Ver el recibo N° ${numeroRecibo(c.numeroRecibo)}`}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-tenue transition-colors hover:bg-pino-50 hover:text-pino-600 [&_svg]:size-4"
                        >
                          <FileText />
                        </a>
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

      <RegistrarPagoDialog abierto={registrando} onAbiertoChange={setRegistrando} />
      <CobroDetalleDialog cobroId={detalle} onCerrar={() => setDetalle(null)} />
      <AccionLoteDialog
        abierto={lote !== null}
        onAbiertoChange={(v) => !v && setLote(null)}
        titulo={lote === 'anular' ? 'Anular cobros' : 'Eliminar cobros anulados'}
        descripcion={
          lote === 'anular'
            ? `${plural(enLote.length, 'cobro')} por ${pesos(enLote.reduce((t, c) => t + c.total, 0))}. Sus cuotas vuelven a quedar pendientes y los recibos quedan anulados.`
            : `Se borran ${plural(enLote.length, 'cobro anulado', 'cobros anulados')} con sus recibos y no se puede deshacer. Las cuotas no cambian: ya habían vuelto a pendiente al anular. Los números de recibo no se reutilizan.`
        }
        confirmar={lote === 'anular' ? `Anular ${plural(enLote.length, 'cobro')}` : `Eliminar ${plural(enLote.length, 'cobro')}`}
        conMotivo={lote === 'anular'}
        cargando={anularLote.isPending || eliminarLote.isPending}
        onConfirmar={(motivo) => {
          const ids = enLote.map((c) => c.id);
          return lote === 'anular' ? anularLote.mutateAsync({ ids, motivo: motivo! }) : eliminarLote.mutateAsync(ids);
        }}
        etiquetaDe={(id) => {
          const c = seleccion.elegidos.find((e) => e.id === id);
          return c ? `Recibo ${numeroRecibo(c.numeroRecibo)} · ${nombreCompleto(c.socio)}` : `Cobro ${id}`;
        }}
        hecho={lote === 'anular' ? ['cobro anulado', 'cobros anulados'] : ['cobro eliminado', 'cobros eliminados']}
        onTerminado={seleccion.limpiar}
      />
    </>
  );
}

function valorValido(valor: string | null): string | undefined {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined;
}
