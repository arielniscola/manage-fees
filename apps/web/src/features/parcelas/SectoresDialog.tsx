import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { sectorCrearSchema, type Sector, type SectorCrear, type SectorCrearInput } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { ApiError } from '@/lib/api';
import { plural } from '@/lib/formato';
import { useEliminarSector, useGuardarSector, useLoteos, useSectores } from './api';

/**
 * Alta, edición y baja de sectores: las manzanas dentro de cada loteo, como «7» o «A-01».
 * Es un catálogo chico, así que se administra acá y no en una pantalla propia.
 */
export function SectoresDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  // Con un loteo activo el catálogo muestra solo sus manzanas, igual que el resto de la app.
  const { loteoId } = useLoteoActivo();
  const { data: sectores, isPending, isError, error } = useSectores(loteoId);
  const [editando, setEditando] = useState<Sector | 'nuevo' | null>(null);
  const [eliminando, setEliminando] = useState<Sector | null>(null);

  useEffect(() => {
    if (!abierto) setEditando(null);
  }, [abierto]);

  return (
    <>
      <Dialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo="Sectores"
        descripcion="Las manzanas en las que se divide cada loteo. Dentro de un sector van las parcelas."
        pie={
          <div className="flex flex-1 items-center justify-between gap-4">
            {editando ? (
              <span className="text-sm text-tenue">
                {editando === 'nuevo' ? 'Nuevo sector' : `Editando «${editando.nombre}»`}
              </span>
            ) : (
              <Button variante="secundario" tamanio="sm" onClick={() => setEditando('nuevo')}>
                <Plus /> Nuevo sector
              </Button>
            )}
            <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {editando && <Formulario sector={editando} onCerrar={() => setEditando(null)} />}

          {isError ? (
            <p className="py-6 text-center text-sm text-mor">{error.message}</p>
          ) : isPending ? (
            <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
          ) : sectores.length === 0 ? (
            <Vacio
              titulo="Todavía no hay sectores"
              descripcion="Creá el primero para poder agrupar las parcelas por zona."
              accion={
                !editando && (
                  <Button onClick={() => setEditando('nuevo')}>
                    <Plus /> Nuevo sector
                  </Button>
                )
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-control border border-borde">
              {sectores.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-borde px-4 py-2.5 last:border-b-0 hover:bg-superficie-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{s.nombre}</span>
                    <span className="text-xs text-tenue">
                      {s.loteo ? s.loteo.nombre : 'Sin loteo'} · {s.parcelas === 0 ? 'sin parcelas' : plural(s.parcelas, 'parcela')}
                      {s.descripcion && ` · ${s.descripcion}`}
                    </span>
                  </span>
                  <IconoBoton etiqueta={`Editar ${s.nombre}`} onClick={() => setEditando(s)}>
                    <Pencil />
                  </IconoBoton>
                  {s.puedeEliminar && (
                    <IconoBoton etiqueta={`Eliminar ${s.nombre}`} onClick={() => setEliminando(s)} peligro>
                      <Trash2 />
                    </IconoBoton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      <EliminarSectorDialog sector={eliminando} onCerrar={() => setEliminando(null)} />
    </>
  );
}

function Formulario({ sector, onCerrar }: { sector: Sector | 'nuevo'; onCerrar: () => void }) {
  const existente = sector === 'nuevo' ? null : sector;
  const guardar = useGuardarSector(existente?.id ?? null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SectorCrearInput, unknown, SectorCrear>({ resolver: zodResolver(sectorCrearSchema) });
  const { data: loteos = [] } = useLoteos();
  const { loteoId } = useLoteoActivo();

  useEffect(() => {
    reset({
      nombre: existente?.nombre ?? '',
      // Un sector nuevo nace en el loteo activo, que es donde se lo está buscando.
      loteoId: existente?.loteo?.id ?? loteoId ?? '',
      descripcion: existente?.descripcion ?? '',
    });
  }, [sector, existente, loteoId, reset]);

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: (s) => {
        toast.success(existente ? `Sector «${s.nombre}» actualizado` : `Sector «${s.nombre}» creado`);
        onCerrar();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.field === 'nombre') setError('nombre', { message: e.message }, { shouldFocus: true });
        else toast.error(e.message);
      },
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-control border border-borde bg-superficie-2 p-4">
      <div className="flex items-start gap-3">
        <Field label="Nombre" htmlFor="sector-nombre" requerido error={errors.nombre?.message} className="flex-1">
          <Input id="sector-nombre" autoFocus placeholder="7" invalido={!!errors.nombre} {...register('nombre')} />
        </Field>
        <Field
          label="Loteo"
          htmlFor="sector-loteo"
          error={errors.loteoId?.message}
          className="flex-1"
          ayuda={loteos.length === 0 ? 'Todavía no hay loteos' : undefined}
        >
          <Select id="sector-loteo" invalido={!!errors.loteoId} {...register('loteoId')}>
            <option value="">Sin loteo</option>
            {loteos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descripción" htmlFor="sector-descripcion" error={errors.descripcion?.message} className="flex-1">
          <Input id="sector-descripcion" placeholder="Opcional" invalido={!!errors.descripcion} {...register('descripcion')} />
        </Field>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cancelar"
          className="mt-[26px] inline-flex size-10 items-center justify-center rounded-lg text-tenue hover:bg-superficie hover:text-tinta"
        >
          <X className="size-4" />
        </button>
      </div>
      <Button type="submit" tamanio="sm" cargando={guardar.isPending} className="self-start">
        {existente ? 'Guardar cambios' : 'Crear sector'}
      </Button>
    </form>
  );
}

function IconoBoton({ etiqueta, onClick, peligro, children }: { etiqueta: string; onClick: () => void; peligro?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      onClick={onClick}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-tenue transition-colors [&_svg]:size-4 ${peligro ? 'hover:bg-mor-fondo hover:text-mor' : 'hover:bg-pino-50 hover:text-pino-600'}`}
    >
      {children}
    </button>
  );
}

function EliminarSectorDialog({ sector, onCerrar }: { sector: Sector | null; onCerrar: () => void }) {
  const eliminar = useEliminarSector();
  return (
    <Dialog
      abierto={!!sector}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo={`Eliminar el sector «${sector?.nombre ?? ''}»`}
      descripcion="El sector no tiene parcelas, así que se elimina por completo."
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variante="peligro"
            cargando={eliminar.isPending}
            onClick={() =>
              sector &&
              eliminar.mutate(sector.id, {
                onSuccess: () => {
                  toast.success(`Sector «${sector.nombre}» eliminado`);
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
