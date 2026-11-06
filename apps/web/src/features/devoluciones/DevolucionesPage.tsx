import { useEffect, useState } from 'react';
import { CalendarDays, FileText, ListChecks, Plus, Search } from 'lucide-react';
import {
  ETIQUETA_DESTINO_CUOTAS,
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  ORDEN_DEVOLUCIONES,
  hoy,
  inicioDelMes,
  numeroDevolucion,
  numeroRecibo,
  pesos,
  type MedioPago,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, ThOrden, Vacio } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl, useOrdenUrl } from '@/lib/hooks';
import { urlComprobanteDevolucion, useDevoluciones } from './api';
import { BadgeDevolucion, DevolucionDetalleDialog } from './DevolucionDetalleDialog';
import { MotivosDevolucionDialog } from './MotivosDevolucionDialog';
import { NuevaDevolucionDialog } from './NuevaDevolucionDialog';

type EstadoFiltro = 'vigentes' | 'anuladas' | 'todas';
const PAGE_SIZE = 25;

/** Las devoluciones se registran eligiendo un cobro; acá también se consultan, se reimprimen y se anulan. */
export function DevolucionesPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('vigentes', loteoId);
  const orden = useOrdenUrl(filtros, ORDEN_DEVOLUCIONES, { columna: 'fecha', dir: 'desc' });
  const medioUrl = filtros.params.get('medio') as MedioPago | null;
  const medio = medioUrl && MEDIOS_PAGO.includes(medioUrl) ? medioUrl : undefined;
  const desde = valorValido(filtros.params.get('desde'));
  const hasta = valorValido(filtros.params.get('hasta'));
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [detalle, setDetalle] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const [verMotivos, setVerMotivos] = useState(false);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useDevoluciones({
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
  const [verFechas, setVerFechas] = useState(porFecha);
  const filtrando = !!filtros.q || filtros.estado !== 'vigentes' || !!medio || porFecha;
  const rango = (d: string, h: string) => filtros.actualizar({ desde: d, hasta: h });

  return (
    <>
      <Encabezado
        antetitulo={data ? `${plural(data.resumen.devoluciones, 'devolución', 'devoluciones')} · ${pesos(data.resumen.total)}` : ' '}
        titulo="Devoluciones"
        acciones={
          <>
            <Button variante="secundario" onClick={() => setVerMotivos(true)}>
              <ListChecks /> Motivos
            </Button>
            <Button onClick={() => setNueva(true)}>
              <Plus /> Nueva devolución
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-devolucion"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por socio, DNI, N° de devolución o de recibo"
            className="pl-10"
            aria-label="Buscar devolución"
          />
        </div>
        <div className="flex items-center gap-3">
          <Chips
            etiqueta="Estado"
            valor={filtros.estado}
            onChange={(estado) => filtros.actualizar({ estado })}
            opciones={[
              { valor: 'vigentes', label: 'Vigentes' },
              { valor: 'anuladas', label: 'Anuladas' },
              { valor: 'todas', label: 'Todas' },
            ]}
          />
          <div className="w-[170px] shrink-0">
            <Select
              aria-label="Medio de la devolución"
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
            <Vacio titulo="No hay devoluciones que coincidan" descripcion="Probá con otro socio o número, o cambiá los filtros." />
          ) : (
            <Vacio
              titulo="Todavía no hay devoluciones"
              descripcion="Para devolverle a un socio el dinero de un cobro, usá «Nueva devolución» o abrí el cobro y elegí «Devolver dinero»."
            />
          )
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <ThOrden orden={orden} columna="numero" primero="desc">
                    N°
                  </ThOrden>
                  <ThOrden orden={orden} columna="fecha" primero="desc">
                    Fecha
                  </ThOrden>
                  <ThOrden orden={orden} columna="socio">
                    Socio
                  </ThOrden>
                  <Th>Recibo</Th>
                  <Th>Cuotas</Th>
                  <Th>Medio</Th>
                  <ThOrden orden={orden} columna="importe" primero="desc" className="text-right">
                    Importe
                  </ThOrden>
                  <Th>Estado</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={9} />
                ) : (
                  data.items.map((d) => (
                    <tr key={d.id} onClick={() => setDetalle(d.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
                      <Td className="font-semibold tabular">{numeroDevolucion(d.numero)}</Td>
                      <Td className="tabular">{fecha(d.fecha)}</Td>
                      <Td>
                        <span className="font-medium">{nombreCompleto(d.socio)}</span>
                        <span className="block text-xs tabular text-tenue">N° {d.socio.numero}</span>
                      </Td>
                      <Td className="tabular">
                        {numeroRecibo(d.cobro.numeroRecibo)}
                        <span className="block text-xs text-tenue">del {fecha(d.cobro.fecha)}</span>
                      </Td>
                      <Td>
                        <span className="tabular">{d.cantidadCuotas}</span>
                        <span className="block text-xs text-tenue">{ETIQUETA_DESTINO_CUOTAS[d.destinoCuotas].toLowerCase()}</span>
                      </Td>
                      <Td>{ETIQUETA_MEDIO_PAGO[d.medio]}</Td>
                      <Td className={`text-right tabular ${d.anulada ? 'text-tenue line-through' : 'font-semibold'}`}>{pesos(d.importe)}</Td>
                      <Td>
                        <BadgeDevolucion anulada={d.anulada} />
                      </Td>
                      <Td className="text-right">
                        <a
                          href={urlComprobanteDevolucion(d.id)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Ver el comprobante N° ${numeroDevolucion(d.numero)}`}
                          aria-label={`Ver el comprobante N° ${numeroDevolucion(d.numero)}`}
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

      <DevolucionDetalleDialog devolucionId={detalle} onCerrar={() => setDetalle(null)} />
      <NuevaDevolucionDialog abierto={nueva} onCerrar={() => setNueva(false)} />
      <MotivosDevolucionDialog abierto={verMotivos} onCerrar={() => setVerMotivos(false)} />
    </>
  );
}

function valorValido(valor: string | null): string | undefined {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined;
}
