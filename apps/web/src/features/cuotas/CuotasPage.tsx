import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Ban, PlayCircle, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  cuotaAnularSchema,
  ORIGENES_CUOTA,
  pesos,
  type CuotaAnularInput,
  type CuotaListItem,
  type EstadoCuotaVisible,
  type OrigenCuota,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { useAnularCuota, useCuotas } from './api';
import { BadgeCuota } from './estados';
import { GenerarPeriodoDialog } from './GenerarPeriodoDialog';

type EstadoFiltro = EstadoCuotaVisible | 'todas';
type OrigenFiltro = OrigenCuota | 'todos';
const PAGE_SIZE = 25;

export function CuotasPage() {
  const { loteoId } = useLoteoActivo();
  const filtros = useFiltrosUrl<EstadoFiltro>('todas', loteoId);
  const origenUrl = filtros.params.get('origen') as OrigenCuota | null;
  const origen: OrigenFiltro = origenUrl && ORIGENES_CUOTA.includes(origenUrl) ? origenUrl : 'todos';
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);
  const [generar, setGenerar] = useState(false);
  const [anulando, setAnulando] = useState<CuotaListItem | null>(null);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCuotas({
    q: filtros.q || undefined,
    estado: filtros.estado,
    origen: origen === 'todos' ? undefined : origen,
    loteoId,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  const filtrando = !!filtros.q || filtros.estado !== 'todas' || origen !== 'todos';

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
          ]}
        />
      </div>

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
            <Tabla>
              <thead>
                <tr>
                  <Th>Período</Th>
                  <Th>Socio</Th>
                  <Th>Parcela</Th>
                  <Th>Vence</Th>
                  <Th className="text-right">Importe</Th>
                  <Th>Estado</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={7} />
                ) : (
                  data.items.map((c) => (
                    <tr key={c.id} className="hover:bg-superficie-2">
                      <Td className="whitespace-nowrap font-medium first-letter:uppercase">{c.etiqueta}</Td>
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
                      <Td className="text-right tabular">
                        {pesos(c.importe + c.interes)}
                        {c.interes > 0 && (
                          <span className="block text-xs text-tenue">incluye {pesos(c.interes)} de interés</span>
                        )}
                      </Td>
                      <Td>
                        <BadgeCuota estado={c.estado} diasVencida={c.diasVencida} />
                      </Td>
                      <Td className="text-right">
                        {(c.estado === 'pendiente' || c.estado === 'vencida') && (
                          <button
                            type="button"
                            title={`Anular la cuota ${c.etiqueta}`}
                            aria-label={`Anular la cuota ${c.etiqueta}`}
                            onClick={() => setAnulando(c)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-tenue transition-colors hover:bg-mor-fondo hover:text-mor [&_svg]:size-4"
                          >
                            <Ban />
                          </button>
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
    </>
  );
}

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
