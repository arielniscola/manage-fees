import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALCANCES_TARIFA,
  DESCRIPCION_ALCANCE,
  ETIQUETA_ALCANCE,
  ETIQUETA_PERIODICIDAD,
  PERIODICIDADES,
  etiquetaPeriodo,
  mesActual,
  pesos,
  sumarMeses,
  tarifaCrearSchema,
  vencimientoDe,
  type AlcanceTarifa,
  type Tarifa,
  type TarifaCrear,
  type TarifaCrearInput,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Chips, ErrorCarga, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { ApiError } from '@/lib/api';
import { fecha } from '@/lib/formato';
import { useEliminarTarifa, useGuardarTarifa, useTarifas } from './api';

/**
 * Valor de las dos cuotas del período: la social, que paga el socio por serlo, y la de
 * parcela, que es el pago por la propiedad del terreno. Cada una lleva su propio historial:
 * cambiar el importe no edita la tarifa actual, agrega una nueva con su mes de vigencia, y
 * solo afecta a los períodos futuros.
 */
export function ConfiguracionCuotaPage() {
  const [alcance, setAlcance] = useState<AlcanceTarifa>('PARCELA');
  const { data: tarifas, isPending, isError, error, refetch } = useTarifas(alcance);
  const [editando, setEditando] = useState<Tarifa | 'nueva' | null>(null);
  const [eliminando, setEliminando] = useState<Tarifa | null>(null);

  const vigente = tarifas?.find((t) => t.vigente) ?? null;
  const proxima = tarifas?.filter((t) => t.futura).at(-1) ?? null;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion" className="hover:underline">
              Configuración
            </Link>{' '}
            / Cuotas
          </>
        }
        titulo="Cuotas del período"
        acciones={
          <Button onClick={() => setEditando('nueva')}>
            <Plus /> Nueva tarifa
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        <Chips
          etiqueta="Cuota"
          valor={alcance}
          onChange={setAlcance}
          opciones={ALCANCES_TARIFA.map((a) => ({ valor: a, label: ETIQUETA_ALCANCE[a] }))}
        />
        <p className="text-[13px] text-tenue">{DESCRIPCION_ALCANCE[alcance]}</p>
      </div>

      {isError ? (
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      ) : isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-superficie" />
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <TarifaVigente tarifa={vigente} alcance={alcance} onCargar={() => setEditando('nueva')} />
            {proxima && <TarifaProxima tarifa={proxima} />}
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              titulo="Historial de tarifas"
              descripcion="Cada fila rige desde su mes y hasta que empieza la siguiente. Las cuotas ya generadas conservan el importe con el que se crearon."
            />
            {tarifas.length === 0 ? (
              <Vacio
                titulo="Todavía no hay ninguna tarifa"
                descripcion={`Cargá el importe de ${ETIQUETA_ALCANCE[alcance].toLowerCase()} para poder generar los períodos.`}
                accion={
                  <Button onClick={() => setEditando('nueva')}>
                    <Plus /> Nueva tarifa
                  </Button>
                }
              />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <Th>Rige desde</Th>
                    <Th className="text-right">Importe</Th>
                    <Th>Periodicidad</Th>
                    <Th>Vencimiento</Th>
                    <Th>Cuotas</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((t) => (
                    <tr key={t.id} className="hover:bg-superficie-2">
                      <Td className="whitespace-nowrap">
                        <span className="font-medium first-letter:uppercase">{etiquetaPeriodo(t.vigenteDesde, 'MENSUAL')}</span>
                        <span className="ml-2 inline-flex align-middle">
                          {t.vigente ? <Badge tono="ok">Vigente</Badge> : t.futura ? <Badge tono="pend">Futura</Badge> : null}
                        </span>
                      </Td>
                      <Td className="text-right font-semibold tabular">{pesos(t.importe)}</Td>
                      <Td>{ETIQUETA_PERIODICIDAD[t.periodicidad]}</Td>
                      <Td className="tabular text-tenue">Día {t.diaVencimiento}</Td>
                      <Td className="tabular text-tenue">{t.cuotasGeneradas || '—'}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {t.puedeEditar ? (
                            <>
                              <IconoBoton etiqueta={`Editar la tarifa de ${t.vigenteDesde}`} onClick={() => setEditando(t)}>
                                <Pencil />
                              </IconoBoton>
                              <IconoBoton etiqueta={`Eliminar la tarifa de ${t.vigenteDesde}`} onClick={() => setEliminando(t)} peligro>
                                <Trash2 />
                              </IconoBoton>
                            </>
                          ) : (
                            <span className="pr-2 text-xs text-tenue">Ya generó cuotas</span>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Card>
        </>
      )}

      <TarifaFormDialog alcance={alcance} tarifa={editando} tarifas={tarifas ?? []} onCerrar={() => setEditando(null)} />
      <EliminarTarifaDialog tarifa={eliminando} onCerrar={() => setEliminando(null)} />
    </>
  );
}

function TarifaVigente({ tarifa, alcance, onCargar }: { tarifa: Tarifa | null; alcance: AlcanceTarifa; onCargar: () => void }) {
  if (!tarifa) {
    return (
      <Card className="flex flex-col items-start gap-3 px-7 py-6">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Cuota vigente</span>
        <p className="text-sm text-tenue">
          Todavía no hay una tarifa en vigencia, así que la generación de cuotas no tiene con qué trabajar.
        </p>
        <Button onClick={onCargar}>
          <Plus /> Cargar la primera tarifa
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 px-7 py-6">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Cuota vigente</span>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-serif text-[40px] font-medium leading-none tabular">{pesos(tarifa.importe)}</span>
        <span className="text-sm text-tenue">
          {alcance === 'SOCIO' ? 'por socio' : 'por parcela'} · {ETIQUETA_PERIODICIDAD[tarifa.periodicidad].toLowerCase()}
        </span>
      </div>
      <p className="text-sm text-tenue">
        Rige desde <span className="first-letter:uppercase">{etiquetaPeriodo(tarifa.vigenteDesde, 'MENSUAL')}</span>. Vence el día{' '}
        {tarifa.diaVencimiento} del primer mes de cada período; por ejemplo, el período que empieza en{' '}
        {etiquetaPeriodo(mesActual(), 'MENSUAL')} vence el {fecha(vencimientoDe(mesActual(), tarifa.diaVencimiento))}.
      </p>
    </Card>
  );
}

function TarifaProxima({ tarifa }: { tarifa: Tarifa }) {
  return (
    <Card className="flex flex-col gap-3 px-7 py-6">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-tenue">
        <CalendarClock className="size-4" /> Próximo cambio
      </span>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-serif text-[30px] font-medium leading-none tabular">{pesos(tarifa.importe)}</span>
        <span className="text-sm text-tenue">{ETIQUETA_PERIODICIDAD[tarifa.periodicidad].toLowerCase()}</span>
      </div>
      <p className="text-sm text-tenue">
        Empieza a aplicarse a los períodos que arranquen desde{' '}
        <span className="first-letter:uppercase">{etiquetaPeriodo(tarifa.vigenteDesde, 'MENSUAL')}</span>. Las cuotas
        anteriores no cambian.
      </p>
    </Card>
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

function TarifaFormDialog({
  alcance,
  tarifa,
  tarifas,
  onCerrar,
}: {
  alcance: AlcanceTarifa;
  tarifa: Tarifa | 'nueva' | null;
  tarifas: Tarifa[];
  onCerrar: () => void;
}) {
  const existente = tarifa && tarifa !== 'nueva' ? tarifa : null;
  const guardar = useGuardarTarifa(existente?.id ?? null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    getValues,
    formState: { errors },
  } = useForm<TarifaCrearInput, unknown, TarifaCrear>({ resolver: zodResolver(tarifaCrearSchema) });

  // Una tarifa nueva no puede pisar períodos ya generados: el mes que se sugiere es el
  // siguiente al de la última tarifa, o el mes actual si es la primera.
  const sugerido = tarifas.length > 0 ? mayor(sumarMeses(tarifas[0].vigenteDesde, 1), mesActual()) : mesActual();

  useEffect(() => {
    if (!tarifa) return;
    reset({
      // El alcance sale de la pestaña: una tarifa no cambia de cuota una vez creada.
      alcance: existente?.alcance ?? alcance,
      importe: existente ? pesos(existente.importe, { simbolo: false }) : '',
      periodicidad: existente?.periodicidad ?? tarifas[0]?.periodicidad ?? 'MENSUAL',
      diaVencimiento: existente?.diaVencimiento ?? tarifas[0]?.diaVencimiento ?? 10,
      vigenteDesde: existente?.vigenteDesde ?? sugerido,
    });
  }, [tarifa, existente, alcance, reset]);

  const vigenteDesde = watch('vigenteDesde');
  const diaVencimiento = Number(watch('diaVencimiento'));

  // Se manda lo que está escrito en el formulario, no lo que devuelve el resolver: el
  // importe que sale de zod ya está en centavos y el servidor lo vuelve a convertir, así
  // que «10.000» terminaría guardado como un millón. El resolver sigue validando.
  const onSubmit = handleSubmit(() =>
    guardar.mutate(getValues(), {
      onSuccess: () => {
        toast.success(existente ? 'Tarifa actualizada' : 'Tarifa cargada');
        onCerrar();
      },
      onError: (e) => {
        if (e instanceof ApiError && (e.field === 'vigenteDesde' || e.field === 'importe')) {
          setError(e.field, { message: e.message }, { shouldFocus: true });
        } else toast.error(e.message);
      },
    }),
  );

  return (
    <Dialog
      abierto={!!tarifa}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo={`${existente ? 'Editar' : 'Nueva'} tarifa · ${ETIQUETA_ALCANCE[existente?.alcance ?? alcance]}`}
      descripcion={
        existente
          ? 'Esta tarifa todavía no generó cuotas, así que se puede corregir.'
          : 'El importe nuevo se aplica a los períodos que empiecen desde el mes que elijas. Las cuotas ya generadas no cambian.'
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button form="form-tarifa" type="submit" cargando={guardar.isPending}>
            {existente ? 'Guardar cambios' : 'Cargar tarifa'}
          </Button>
        </>
      }
    >
      <form id="form-tarifa" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label={(existente?.alcance ?? alcance) === 'SOCIO' ? 'Importe por socio' : 'Importe por parcela'}
          htmlFor="importe"
          requerido
          error={errors.importe?.message}
          ayuda="Por ejemplo 12.000 o 12.000,50"
        >
          <Input id="importe" autoFocus inputMode="decimal" className="tabular" placeholder="0,00" invalido={!!errors.importe} {...register('importe')} />
        </Field>
        <Field label="Periodicidad" htmlFor="periodicidad" requerido error={errors.periodicidad?.message}>
          <Select id="periodicidad" invalido={!!errors.periodicidad} {...register('periodicidad')}>
            {PERIODICIDADES.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PERIODICIDAD[p]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rige desde" htmlFor="vigenteDesde" requerido error={errors.vigenteDesde?.message}>
            <Input id="vigenteDesde" type="month" className="tabular" invalido={!!errors.vigenteDesde} {...register('vigenteDesde')} />
          </Field>
          <Field label="Día de vencimiento" htmlFor="diaVencimiento" requerido error={errors.diaVencimiento?.message}>
            <Input id="diaVencimiento" type="number" min={1} max={31} className="tabular" invalido={!!errors.diaVencimiento} {...register('diaVencimiento')} />
          </Field>
        </div>
        {esMes(vigenteDesde) && diaVencimiento >= 1 && diaVencimiento <= 31 && (
          <p className="rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue">
            La primera cuota con esta tarifa será la del período{' '}
            <span className="font-medium text-tinta first-letter:uppercase">{etiquetaPeriodo(vigenteDesde, watch('periodicidad') ?? 'MENSUAL')}</span>, con
            vencimiento el {fecha(vencimientoDe(vigenteDesde, diaVencimiento))}.
          </p>
        )}
      </form>
    </Dialog>
  );
}

function EliminarTarifaDialog({ tarifa, onCerrar }: { tarifa: Tarifa | null; onCerrar: () => void }) {
  const eliminar = useEliminarTarifa();
  return (
    <Dialog
      abierto={!!tarifa}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Eliminar tarifa"
      descripcion="La tarifa todavía no generó ninguna cuota, así que se elimina por completo."
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variante="peligro"
            cargando={eliminar.isPending}
            onClick={() =>
              tarifa &&
              eliminar.mutate(tarifa.id, {
                onSuccess: () => {
                  toast.success('Tarifa eliminada');
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

const esMes = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const mayor = (a: string, b: string) => (a >= b ? a : b);
