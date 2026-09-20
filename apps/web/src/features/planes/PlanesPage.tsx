import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search, Users } from 'lucide-react';
import { ESTADOS_PLAN, ETIQUETA_ESTADO_PLAN, numeroPlan, pesos, type EstadoPlan } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { usePlanes } from './api';
import { NuevoPlanDialog } from './NuevoPlanDialog';
import { BadgePlan, PlanDetalleDialog } from './PlanDetalleDialog';

type EstadoFiltro = EstadoPlan | 'todos';
const PAGE_SIZE = 25;

export function PlanesPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('todos', loteoId);
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [creando, setCreando] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = usePlanes({
    q: filtros.q || undefined,
    estado: filtros.estado,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  const filtrando = !!filtros.q || filtros.estado !== 'todos';

  return (
    <>
      <Encabezado
        antetitulo={data ? plural(data.total, 'plan', 'planes') : ' '}
        titulo="Planes de pago"
        acciones={
          <>
            <Link
              to="/socios?estado=moroso"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
            >
              <Users /> Ver morosos
            </Link>
            <Button onClick={() => setCreando(true)}>
              <Plus /> Nuevo plan
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-plan"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por socio, DNI o N° de plan"
            className="pl-10"
            aria-label="Buscar plan"
          />
        </div>
        <Chips
          etiqueta="Estado"
          valor={filtros.estado}
          onChange={(estado) => filtros.actualizar({ estado })}
          opciones={[
            { valor: 'todos' as const, label: 'Todos' },
            ...ESTADOS_PLAN.map((e) => ({ valor: e, label: ETIQUETA_ESTADO_PLAN[e] })),
          ]}
        />
      </div>

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          filtrando ? (
            <Vacio titulo="No hay planes que coincidan" descripcion="Probá con otro socio o número, o cambiá el filtro de estado." />
          ) : (
            <Vacio
              titulo="Todavía no hay planes de pago"
              descripcion="Cuando un socio moroso quiera refinanciar su deuda, armá el plan desde acá."
              accion={
                <Button onClick={() => setCreando(true)}>
                  <Plus /> Nuevo plan
                </Button>
              }
            />
          )
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th>Firmado</Th>
                  <Th>Socio</Th>
                  <Th>Cuotas</Th>
                  <Th className="text-right">Deuda</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th>Próximo vence</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={8} />
                ) : (
                  data.items.map((p) => (
                    <tr key={p.id} onClick={() => setDetalle(p.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
                      <Td className="font-semibold tabular">{numeroPlan(p.numero)}</Td>
                      <Td className="tabular">{fecha(p.fecha)}</Td>
                      <Td>
                        <span className="font-medium">{nombreCompleto(p.socio)}</span>
                        <span className="block text-xs tabular text-tenue">N° {p.socio.numero}</span>
                      </Td>
                      <Td className="tabular text-tenue">
                        {p.pagadas} de {p.cantidadCuotas}
                        {p.anticipo > 0 && <span className="block text-xs">+ anticipo</span>}
                      </Td>
                      <Td className="text-right tabular">{pesos(p.deudaTotal)}</Td>
                      <Td className={`text-right tabular ${p.saldo > 0 ? 'font-semibold' : 'text-tenue'}`}>{pesos(p.saldo)}</Td>
                      <Td className="tabular text-tenue">{p.proximoVencimiento ? fecha(p.proximoVencimiento) : '—'}</Td>
                      <Td>
                        <BadgePlan estado={p.estado} />
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

      <NuevoPlanDialog abierto={creando} onAbiertoChange={setCreando} />
      <PlanDetalleDialog planId={detalle} onCerrar={() => setDetalle(null)} />
    </>
  );
}
