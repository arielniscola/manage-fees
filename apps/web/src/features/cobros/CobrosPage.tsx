import { useEffect, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { ETIQUETA_MEDIO_PAGO, numeroRecibo, pesos } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { urlRecibo, useCobros } from './api';
import { BadgeCobro, CobroDetalleDialog } from './CobroDetalleDialog';
import { RegistrarPagoDialog } from './RegistrarPagoDialog';

type EstadoFiltro = 'vigentes' | 'anulados' | 'todos';
const PAGE_SIZE = 25;

export function CobrosPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('vigentes', loteoId);
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCobros({
    q: filtros.q || undefined,
    estado: filtros.estado,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  const filtrando = !!filtros.q || filtros.estado !== 'vigentes';

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
      </div>

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          filtrando ? (
            <Vacio titulo="No hay cobros que coincidan" descripcion="Probá con otro socio o número de recibo, o cambiá el filtro." />
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
            <Tabla>
              <thead>
                <tr>
                  <Th>Recibo</Th>
                  <Th>Fecha</Th>
                  <Th>Socio</Th>
                  <Th>Cuotas</Th>
                  <Th>Medio</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Estado</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={8} />
                ) : (
                  data.items.map((c) => (
                    <tr key={c.id} onClick={() => setDetalle(c.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
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
    </>
  );
}
