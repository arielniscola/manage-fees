import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftRight, History, LayoutGrid, Map, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { parcelaCrearSchema, type ParcelaCrear, type ParcelaCrearInput, type ParcelaListItem } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { ApiError } from '@/lib/api';
import { fecha, metros, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { useEliminarParcela, useGuardarParcela, useLoteos, useParcelas, useSectores } from './api';
import { LoteosDialog } from './LoteosDialog';
import { TransferirDialog } from './TransferirDialog';
import { SectoresDialog } from './SectoresDialog';

type EstadoFiltro = 'todas' | 'libre' | 'asignada';
const PAGE_SIZE = 25;

export function ParcelasPage() {
  const navigate = useNavigate();
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('todas', loteoId);
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [editando, setEditando] = useState<ParcelaListItem | 'nueva' | null>(null);
  const [eliminando, setEliminando] = useState<ParcelaListItem | null>(null);
  const [transfiriendo, setTransfiriendo] = useState<ParcelaListItem | null>(null);
  const [sectoresAbierto, setSectoresAbierto] = useState(false);
  const [loteosAbierto, setLoteosAbierto] = useState(false);
  const [sectorId, setSectorId] = useState<number | null>(null);
  // El loteo sale del selector del sidebar: acá solo se afina por sector dentro de él.
  const { data: sectoresDelLoteo = [] } = useSectores(loteoId);

  // El sector elegido puede no existir en el loteo nuevo: se limpia al cambiar.
  useEffect(() => {
    setSectorId(null);
  }, [loteoId]);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useParcelas({
    q: filtros.q || undefined,
    estado: filtros.estado,
    sectorId: sectorId ?? undefined,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <Encabezado
        antetitulo={data ? plural(data.total, 'parcela') : ' '}
        titulo="Parcelas"
        acciones={
          <>
            <Button variante="secundario" onClick={() => setLoteosAbierto(true)}>
              <Map /> Loteos
            </Button>
            <Button variante="secundario" onClick={() => setSectoresAbierto(true)}>
              <LayoutGrid /> Sectores
            </Button>
            <Button onClick={() => setEditando('nueva')}>
              <Plus /> Nueva parcela
            </Button>
          </>
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
        {!!sectoresDelLoteo.length && (
          <Select
            aria-label="Filtrar por sector"
            className="w-[170px]"
            value={sectorId ?? ''}
            onChange={(e) => setSectorId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos los sectores</option>
            {sectoresDelLoteo.map((s) => (
              <option key={s.id} value={s.id}>
                {/* Sin loteo activo los nombres se repiten entre loteos: hay que aclararlo. */}
                {loteoId ? s.nombre : `${s.loteo?.nombre ?? 'Sin loteo'} · ${s.nombre}`}
              </option>
            ))}
          </Select>
        )}
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
                  <Th>Loteo y sector</Th>
                  <Th className="text-right">Superficie</Th>
                  <Th>Descripción</Th>
                  <Th>Titular</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={7} />
                ) : (
                  data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-superficie-2">
                      <Td className="font-semibold tabular">
                        <Link to={`/parcelas/${p.id}`} className="hover:underline">
                          {p.codigo}
                        </Link>
                      </Td>
                      <Td>
                        {p.sector ? (
                          <div className="flex flex-col">
                            <span>{p.sector.nombre}</span>
                            <span className="text-xs text-tenue">{p.sector.loteo?.nombre ?? 'Sin loteo'}</span>
                          </div>
                        ) : (
                          <span className="text-tenue">—</span>
                        )}
                      </Td>
                      <Td className="text-right tabular">
                        {p.superficieM2 === null ? <span className="text-tenue">—</span> : metros(p.superficieM2)}
                      </Td>
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
                          {p.estado === 'asignada' && (
                            <IconoBoton etiqueta={`Transferir ${p.codigo}`} onClick={() => setTransfiriendo(p)}>
                              <ArrowLeftRight />
                            </IconoBoton>
                          )}
                          <IconoBoton etiqueta={`Ver la ficha de ${p.codigo}`} onClick={() => navigate(`/parcelas/${p.id}`)}>
                            <History />
                          </IconoBoton>
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
      <SectoresDialog abierto={sectoresAbierto} onAbiertoChange={setSectoresAbierto} />
      <LoteosDialog abierto={loteosAbierto} onAbiertoChange={setLoteosAbierto} />
      <TransferirDialog parcela={transfiriendo} onCerrar={() => setTransfiriendo(null)} />
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

/** El loteo no se guarda en la parcela: sirve para acotar la lista de sectores. */
const TODOS_LOS_LOTEOS = '';
const SIN_LOTEO = 'sin';

/** Alta y edición de una parcela. La usa el listado y también la ficha de la parcela. */
export function ParcelaFormDialog({ parcela, onCerrar }: { parcela: ParcelaListItem | 'nueva' | null; onCerrar: () => void }) {
  const existente = parcela && parcela !== 'nueva' ? parcela : null;
  const guardar = useGuardarParcela(existente?.id ?? null);
  // Los sectores vienen todos, no solo los del loteo activo: desde el formulario se puede
  // mover una parcela a otro loteo, que es justamente lo que el listado no deja ver.
  const { data: sectores = [] } = useSectores();
  const { data: loteos = [] } = useLoteos();
  const { loteoId: loteoActivo } = useLoteoActivo();
  const [loteo, setLoteo] = useState<string>(TODOS_LOS_LOTEOS);
  const { register, handleSubmit, reset, setError, setValue, watch, formState: { errors } } = useForm<ParcelaCrearInput, unknown, ParcelaCrear>({
    resolver: zodResolver(parcelaCrearSchema),
  });

  useEffect(() => {
    if (parcela) {
      reset({
        codigo: existente?.codigo ?? '',
        sectorId: existente?.sector?.id ?? '',
        superficieM2: existente?.superficieM2 ?? '',
        descripcion: existente?.descripcion ?? '',
      });
      // Al editar arranca en el loteo de la parcela; al crear, en el del sidebar.
      const deLaParcela = existente?.sector ? (existente.sector.loteo ? String(existente.sector.loteo.id) : SIN_LOTEO) : null;
      setLoteo(deLaParcela ?? (loteoActivo ? String(loteoActivo) : TODOS_LOS_LOTEOS));
    }
  }, [parcela, existente, loteoActivo, reset]);

  const sectoresDelLoteo = sectores.filter((s) =>
    loteo === TODOS_LOS_LOTEOS ? true : loteo === SIN_LOTEO ? !s.loteo : s.loteo?.id === Number(loteo),
  );

  const cambiarLoteo = (valor: string) => {
    setLoteo(valor);
    // El sector elegido puede no estar en el loteo nuevo: se limpia para no guardar uno de otro.
    const sectorId = Number(watch('sectorId'));
    const sigueValiendo = sectores.some(
      (s) => s.id === sectorId && (valor === TODOS_LOS_LOTEOS || (valor === SIN_LOTEO ? !s.loteo : s.loteo?.id === Number(valor))),
    );
    if (!sigueValiendo) setValue('sectorId', '');
  };

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
        <Field
          label="Código"
          htmlFor="codigo"
          requerido
          error={errors.codigo?.message}
          ayuda="Único dentro del sector, por ejemplo 7-1. Puede repetirse en otro loteo."
        >
          <Input id="codigo" autoFocus className="uppercase tabular" invalido={!!errors.codigo} {...register('codigo')} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {loteos.length > 0 && (
            <Field label="Loteo" htmlFor="loteo" ayuda="Acota los sectores de abajo">
              <Select id="loteo" value={loteo} onChange={(e) => cambiarLoteo(e.target.value)}>
                <option value={TODOS_LOS_LOTEOS}>Todos los loteos</option>
                {loteos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
                <option value={SIN_LOTEO}>Sectores sin loteo</option>
              </Select>
            </Field>
          )}
          <Field
            label="Sector"
            htmlFor="sectorId"
            error={errors.sectorId?.message}
            ayuda={
              sectores.length === 0
                ? 'Todavía no hay sectores cargados'
                : sectoresDelLoteo.length === 0
                  ? 'Ese loteo todavía no tiene sectores'
                  : undefined
            }
          >
            <Select id="sectorId" invalido={!!errors.sectorId} {...register('sectorId')}>
              <option value="">Sin sector</option>
              {sectoresDelLoteo.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* Sin loteo elegido los nombres se repiten entre loteos: hay que aclararlo. */}
                  {loteo === TODOS_LOS_LOTEOS ? `${s.loteo?.nombre ?? 'Sin loteo'} · ${s.nombre}` : s.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Superficie en metros cuadrados"
          htmlFor="superficieM2"
          error={errors.superficieM2?.message}
          ayuda="Opcional. Se admiten decimales, por ejemplo 199,98"
        >
          <Input
            id="superficieM2"
            inputMode="decimal"
            className="tabular"
            placeholder="0,00"
            invalido={!!errors.superficieM2}
            {...register('superficieM2')}
          />
        </Field>
        <Field label="Descripción" htmlFor="descripcion" error={errors.descripcion?.message}>
          <Input id="descripcion" invalido={!!errors.descripcion} {...register('descripcion')} />
        </Field>
      </form>
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
