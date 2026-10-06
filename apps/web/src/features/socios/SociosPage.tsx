import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, History, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { SocioListItem } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Avatar, Badge, Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { AccionLoteDialog, BarraLote, CasillaFila, CasillaTodas, useSeleccion } from '@/components/ui/lotes';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { dni, fecha, iniciales, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { EstadoDeCuenta } from '@/features/cuotas/estados';
import { useEliminarSocios, useSocios } from './api';

type EstadoFiltro = 'activo' | 'moroso' | 'suplente' | 'baja' | 'todos';
const PAGE_SIZE = 20;

const ETIQUETA_LISTADO: Record<EstadoFiltro, [string, string]> = {
  activo: ['socio', 'socios'],
  moroso: ['socio en mora', 'socios en mora'],
  suplente: ['suplente', 'suplentes'],
  baja: ['socio dado de baja', 'socios dados de baja'],
  todos: ['socio', 'socios'],
};

export function SociosPage() {
  const navigate = useNavigate();
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('activo', loteoId);
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [eliminando, setEliminando] = useState(false);
  const eliminar = useEliminarSocios();

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useSocios({
    q: filtros.q || undefined,
    estado: filtros.estado,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  const buscando = !!filtros.q || filtros.estado !== 'activo';
  const seleccion = useSeleccion<SocioListItem>({ q: filtros.q, estado: filtros.estado, loteoId });

  return (
    <>
      <Encabezado
        antetitulo={data ? plural(data.total, ...ETIQUETA_LISTADO[filtros.estado]) : ' '}
        titulo="Socios"
        acciones={
          <>
            <Button variante="secundario" onClick={() => navigate('/socios/historial')}>
              <History /> Historial
            </Button>
            <Button variante="secundario" onClick={() => navigate('/socios/importar')}>
              <Upload /> Importar
            </Button>
            <Button onClick={() => navigate('/socios/nuevo')}>
              <Plus /> Nuevo socio
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-socio"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, DNI, N° de socio o parcela"
            className="pl-10"
            aria-label="Buscar socio"
          />
        </div>
        <Chips
          etiqueta="Estado"
          valor={filtros.estado}
          onChange={(estado) => filtros.actualizar({ estado })}
          opciones={[
            { valor: 'activo', label: 'Activos' },
            { valor: 'moroso', label: 'Morosos' },
            { valor: 'suplente', label: 'Suplentes' },
            { valor: 'baja', label: 'Bajas' },
            { valor: 'todos', label: 'Todos' },
          ]}
        />
      </div>

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          buscando ? (
            <Vacio
              titulo={filtros.estado === 'moroso' && !filtros.q ? 'No hay socios en mora' : 'No hay socios que coincidan'}
              descripcion={
                filtros.estado === 'moroso' && !filtros.q
                  ? 'Ningún socio tiene cuotas vencidas impagas.'
                  : 'Probá con otro nombre, DNI o número de parcela, o cambiá el filtro de estado.'
              }
            />
          ) : (
            <Vacio
              titulo="Todavía no hay socios"
              descripcion="Cargá el primer socio para empezar a asignarle parcelas."
              accion={
                <Button onClick={() => navigate('/socios/nuevo')}>
                  <Plus /> Nuevo socio
                </Button>
              }
            />
          )
        ) : (
          <>
            <BarraLote cantidad={seleccion.cantidad} onLimpiar={seleccion.limpiar}>
              <Button variante="peligro" tamanio="sm" onClick={() => setEliminando(true)}>
                <Trash2 /> Eliminar
              </Button>
            </BarraLote>
            <Tabla>
              <thead>
                <tr>
                  <CasillaTodas items={data?.items ?? []} seleccion={seleccion} />
                  <Th className="w-[72px]">N°</Th>
                  <Th>Socio</Th>
                  <Th>Parcelas</Th>
                  <Th>Cuenta</Th>
                  <Th>Contacto</Th>
                  <Th>Socio desde</Th>
                  <Th>Estado</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={9} />
                ) : (
                  data.items.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/socios/${s.id}`)}
                      className="cursor-pointer transition-colors hover:bg-superficie-2"
                    >
                      <CasillaFila item={s} seleccion={seleccion} etiqueta={nombreCompleto(s)} />
                      <Td className="tabular text-tenue">{s.numero}</Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar texto={iniciales(s)} />
                          <div className="flex flex-col">
                            <Link to={`/socios/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-tinta hover:underline">
                              {nombreCompleto(s)}
                            </Link>
                            <span className="text-xs tabular text-tenue">DNI {dni(s.dni)}</span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {s.parcelas.length === 0 ? (
                          s.tipo === 'SUPLENTE' ? (
                            <Badge tono="pend">Suplente</Badge>
                          ) : (
                            <span className="text-tenue">Sin parcelas</span>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {s.parcelas.map((p) => (
                              <Badge key={p.id} tono="pino" punto={false}>
                                {p.etiqueta}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <EstadoDeCuenta cuenta={s.estadoCuenta} />
                      </Td>
                      <Td>
                        <div className="flex flex-col text-[13px]">
                          <span>{s.email ?? <span className="text-tenue">Sin email</span>}</span>
                          {s.telefono && <span className="text-tenue">{s.telefono}</span>}
                        </div>
                      </Td>
                      <Td className="tabular text-tenue">{fecha(s.fechaAlta)}</Td>
                      <Td>{s.estado === 'activo' ? <Badge tono="ok">Activo</Badge> : <Badge tono="baja">Baja</Badge>}</Td>
                      <Td className="text-placeholder">
                        <ChevronRight className="size-4" />
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

      <AccionLoteDialog
        abierto={eliminando}
        onAbiertoChange={setEliminando}
        titulo="Eliminar socios"
        descripcion={`Se borran ${plural(seleccion.cantidad, 'socio')} con sus cuotas impagas y anuladas, y sus parcelas quedan libres. No se puede deshacer. Los que tengan cobros, cuotas pagadas, planes o transferencias no se borran: a esos hay que darlos de baja.`}
        confirmar={`Eliminar ${plural(seleccion.cantidad, 'socio')}`}
        cargando={eliminar.isPending}
        onConfirmar={() => eliminar.mutateAsync(seleccion.elegidos.map((s) => s.id))}
        etiquetaDe={(id) => {
          const s = seleccion.elegidos.find((e) => e.id === id);
          return s ? `${nombreCompleto(s)} (N° ${s.numero})` : `Socio ${id}`;
        }}
        hecho={['socio eliminado', 'socios eliminados']}
        onTerminado={seleccion.limpiar}
      />
    </>
  );
}
