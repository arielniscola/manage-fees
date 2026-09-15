import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { parcelaCrearSchema, type ParcelaCrear, type ParcelaCrearInput, type ParcelaListItem } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { ApiError } from '@/lib/api';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { useEliminarParcela, useGuardarParcela, useParcela, useParcelas } from './api';

type EstadoFiltro = 'todas' | 'libre' | 'asignada';
const PAGE_SIZE = 25;

export function ParcelasPage() {
  const filtros = useFiltrosUrl<EstadoFiltro>('todas');
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [editando, setEditando] = useState<ParcelaListItem | 'nueva' | null>(null);
  const [historial, setHistorial] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState<ParcelaListItem | null>(null);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useParcelas({
    q: filtros.q || undefined,
    estado: filtros.estado,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <Encabezado
        antetitulo={data ? plural(data.total, 'parcela') : ' '}
        titulo="Parcelas"
        acciones={
          <Button onClick={() => setEditando('nueva')}>
            <Plus /> Nueva parcela
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[340px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-parcela"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por código, sector o descripción"
            className="pl-10"
            aria-label="Buscar parcela"
          />
        </div>
        <Chips
          etiqueta="Estado"
          valor={filtros.estado}
          onChange={(estado) => filtros.actualizar({ estado })}
          opciones={[
            { valor: 'todas', label: 'Todas' },
            { valor: 'libre', label: 'Libres' },
            { valor: 'asignada', label: 'Asignadas' },
          ]}
        />
      </div>

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          filtros.q || filtros.estado !== 'todas' ? (
            <Vacio titulo="No hay parcelas que coincidan" descripcion="Probá con otro código o cambiá el filtro de estado." />
          ) : (
            <Vacio
              titulo="Todavía no hay parcelas"
              descripcion="Cargá las parcelas para poder asignarlas a los socios."
              accion={<Button onClick={() => setEditando('nueva')}><Plus /> Nueva parcela</Button>}
            />
          )
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Sector</Th>
                  <Th>Descripción</Th>
                  <Th>Titular</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={6} />
                ) : (
                  data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-superficie-2">
                      <Td className="font-semibold tabular">{p.codigo}</Td>
                      <Td>{p.sector ?? <span className="text-tenue">—</span>}</Td>
                      <Td className="max-w-[260px] truncate text-tenue">{p.descripcion ?? '—'}</Td>
                      <Td>
                        {p.titular ? (
                          <div className="flex flex-col">
                            <Link to={`/socios/${p.titular.id}`} className="font-medium text-tinta hover:underline">
                              {nombreCompleto(p.titular)}
                            </Link>
                            <span className="text-xs tabular text-tenue">N° {p.titular.numero} · desde {fecha(p.titular.desde)}</span>
                          </div>
                        ) : (
                          <span className="text-tenue">—</span>
                        )}
                      </Td>
                      <Td>{p.estado === 'libre' ? <Badge tono="pend">Libre</Badge> : <Badge tono="ok">Asignada</Badge>}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <IconoBoton etiqueta={`Historial de ${p.codigo}`} onClick={() => setHistorial(p.id)}><History /></IconoBoton>
                          <IconoBoton etiqueta={`Editar ${p.codigo}`} onClick={() => setEditando(p)}><Pencil /></IconoBoton>
                          {p.puedeEliminar && (
                            <IconoBoton etiqueta={`Eliminar ${p.codigo}`} onClick={() => setEliminando(p)} peligro><Trash2 /></IconoBoton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Tabla>
            {data && <Paginacion page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => filtros.actualizar({ page })} />}
          </>
        )}
      </Card>

      <ParcelaFormDialog parcela={editando} onCerrar={() => setEditando(null)} />
      <HistorialDialog parcelaId={historial} onCerrar={() => setHistorial(null)} />
      <EliminarDialog parcela={eliminando} onCerrar={() => setEliminando(null)} />
    </>
  );
}

function IconoBoton({ etiqueta, onClick, peligro, children }: { etiqueta: string; onClick: () => void; peligro?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-tenue transition-colors [&_svg]:size-4 ${peligro ? 'hover:bg-mor-fondo hover:text-mor' : 'hover:bg-pino-50 hover:text-pino-600'}`}
    >
      {children}
    </button>
  );
}

function ParcelaFormDialog({ parcela, onCerrar }: { parcela: ParcelaListItem | 'nueva' | null; onCerrar: () => void }) {
  const existente = parcela && parcela !== 'nueva' ? parcela : null;
  const guardar = useGuardarParcela(existente?.id ?? null);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<ParcelaCrearInput, unknown, ParcelaCrear>({
    resolver: zodResolver(parcelaCrearSchema),
  });

  useEffect(() => {
    if (parcela) reset({ codigo: existente?.codigo ?? '', sector: existente?.sector ?? '', descripcion: existente?.descripcion ?? '' });
  }, [parcela, existente, reset]);

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: (p) => {
        toast.success(existente ? `Parcela ${p.codigo} actualizada` : `Parcela ${p.codigo} creada`);
        onCerrar();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.field === 'codigo') setError('codigo', { message: e.message }, { shouldFocus: true });
        else toast.error(e.message);
      },
    }),
  );

  return (
    <Dialog
      abierto={!!parcela}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={existente ? `Editar parcela ${existente.codigo}` : 'Nueva parcela'}
      ancho="sm"
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button form="form-parcela" type="submit" cargando={guardar.isPending}>
            {existente ? 'Guardar cambios' : 'Crear parcela'}
          </Button>
        </>
      }
    >
      <form id="form-parcela" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Código" htmlFor="codigo" requerido error={errors.codigo?.message} ayuda="Identificador único, por ejemplo A-012">
          <Input id="codigo" autoFocus className="uppercase tabular" invalido={!!errors.codigo} {...register('codigo')} />
        </Field>
        <Field label="Sector" htmlFor="sector" error={errors.sector?.message}>
          <Input id="sector" invalido={!!errors.sector} {...register('sector')} />
        </Field>
        <Field label="Descripción" htmlFor="descripcion" error={errors.descripcion?.message}>
          <Input id="descripcion" invalido={!!errors.descripcion} {...register('descripcion')} />
        </Field>
      </form>
    </Dialog>
  );
}

function HistorialDialog({ parcelaId, onCerrar }: { parcelaId: number | null; onCerrar: () => void }) {
  const { data, isPending, isError, error } = useParcela(parcelaId);
  return (
    <Dialog
      abierto={!!parcelaId}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={data ? `Historial de ${data.codigo}` : 'Historial'}
      descripcion={data ? [data.sector, data.descripcion].filter(Boolean).join(' · ') || undefined : undefined}
    >
      {isPending ? (
        <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-mor">{error.message}</p>
      ) : data.asignaciones.length === 0 ? (
        <p className="py-6 text-center text-sm text-tenue">La parcela nunca estuvo asignada.</p>
      ) : (
        <div className="overflow-hidden rounded-control border border-borde">
          <Tabla>
            <thead>
              <tr><Th>Socio</Th><Th>Desde</Th><Th>Hasta</Th></tr>
            </thead>
            <tbody>
              {data.asignaciones.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link to={`/socios/${a.socio.id}`} onClick={onCerrar} className="font-medium hover:underline">{nombreCompleto(a.socio)}</Link>
                    <span className="block text-xs tabular text-tenue">N° {a.socio.numero}</span>
                  </Td>
                  <Td className="tabular">{fecha(a.desde)}</Td>
                  <Td className="tabular">{a.hasta ? fecha(a.hasta) : <Badge tono="ok">Vigente</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}
    </Dialog>
  );
}

function EliminarDialog({ parcela, onCerrar }: { parcela: ParcelaListItem | null; onCerrar: () => void }) {
  const eliminar = useEliminarParcela();
  return (
    <Dialog
      abierto={!!parcela}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={`Eliminar parcela ${parcela?.codigo ?? ''}`}
      ancho="sm"
      descripcion="La parcela nunca estuvo asignada, así que se elimina por completo. Esta acción no se puede deshacer."
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button
            variante="peligro"
            cargando={eliminar.isPending}
            onClick={() =>
              parcela &&
              eliminar.mutate(parcela.id, {
                onSuccess: () => {
                  toast.success(`Parcela ${parcela.codigo} eliminada`);
                  onCerrar();
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Eliminar
          </Button>
        </>
      }
    />
  );
}
