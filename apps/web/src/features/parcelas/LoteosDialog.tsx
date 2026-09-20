import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { loteoCrearSchema, type Loteo, type LoteoCrear, type LoteoCrearInput } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { plural } from '@/lib/formato';
import { useEliminarLoteo, useGuardarLoteo, useLoteos } from './api';

/**
 * Alta, edición y baja de loteos: el nivel de arriba de Loteo > Sector > Parcela.
 * Un loteo es un fraccionamiento del predio, como «Lavalle».
 */
export function LoteosDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const { data: loteos, isPending, isError, error } = useLoteos();
  const [editando, setEditando] = useState<Loteo | 'nuevo' | null>(null);
  const [eliminando, setEliminando] = useState<Loteo | null>(null);

  useEffect(() => {
    if (!abierto) setEditando(null);
  }, [abierto]);

  return (
    <>
      <Dialog
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo="Loteos"
        descripcion="Los fraccionamientos del predio. Cada loteo se divide en sectores, y cada sector en parcelas."
        pie={
          <div className="flex flex-1 items-center justify-between gap-4">
            {editando ? (
              <span className="text-sm text-tenue">
                {editando === 'nuevo' ? 'Nuevo loteo' : `Editando «${editando.nombre}»`}
              </span>
            ) : (
              <Button variante="secundario" tamanio="sm" onClick={() => setEditando('nuevo')}>
                <Plus /> Nuevo loteo
              </Button>
            )}
            <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {editando && <Formulario loteo={editando} onCerrar={() => setEditando(null)} />}

          {isError ? (
            <p className="py-6 text-center text-sm text-mor">{error.message}</p>
          ) : isPending ? (
            <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
          ) : loteos.length === 0 ? (
            <Vacio
              titulo="Todavía no hay loteos"
              descripcion="Creá el primero para poder agrupar los sectores."
              accion={
                !editando && (
                  <Button onClick={() => setEditando('nuevo')}>
                    <Plus /> Nuevo loteo
                  </Button>
                )
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-control border border-borde">
              {loteos.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 border-b border-borde px-4 py-2.5 last:border-b-0 hover:bg-superficie-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{l.nombre}</span>
                    <span className="text-xs text-tenue">
                      {l.sectores === 0 ? 'Sin sectores' : `${plural(l.sectores, 'sector', 'sectores')} · ${plural(l.parcelas, 'parcela')}`}
                      {l.direccion && ` · ${l.direccion}`}
                    </span>
                  </span>
                  <IconoBoton etiqueta={`Editar ${l.nombre}`} onClick={() => setEditando(l)}>
                    <Pencil />
                  </IconoBoton>
                  {l.puedeEliminar && (
                    <IconoBoton etiqueta={`Eliminar ${l.nombre}`} onClick={() => setEliminando(l)} peligro>
                      <Trash2 />
                    </IconoBoton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      <EliminarLoteoDialog loteo={eliminando} onCerrar={() => setEliminando(null)} />
    </>
  );
}

function Formulario({ loteo, onCerrar }: { loteo: Loteo | 'nuevo'; onCerrar: () => void }) {
  const existente = loteo === 'nuevo' ? null : loteo;
  const guardar = useGuardarLoteo(existente?.id ?? null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LoteoCrearInput, unknown, LoteoCrear>({ resolver: zodResolver(loteoCrearSchema) });

  useEffect(() => {
    reset({
      nombre: existente?.nombre ?? '',
      descripcion: existente?.descripcion ?? '',
      direccion: existente?.direccion ?? '',
    });
  }, [loteo, existente, reset]);

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: (l) => {
        toast.success(existente ? `Loteo «${l.nombre}» actualizado` : `Loteo «${l.nombre}» creado`);
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
        <Field label="Nombre" htmlFor="loteo-nombre" requerido error={errors.nombre?.message} className="flex-1">
          <Input id="loteo-nombre" autoFocus placeholder="Lavalle" invalido={!!errors.nombre} {...register('nombre')} />
        </Field>
        <Field label="Dirección" htmlFor="loteo-direccion" error={errors.direccion?.message} className="flex-1">
          <Input id="loteo-direccion" placeholder="Opcional" invalido={!!errors.direccion} {...register('direccion')} />
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
      <Field label="Descripción" htmlFor="loteo-descripcion" error={errors.descripcion?.message}>
        <Input id="loteo-descripcion" placeholder="Opcional" invalido={!!errors.descripcion} {...register('descripcion')} />
      </Field>
      <Button type="submit" tamanio="sm" cargando={guardar.isPending} className="self-start">
        {existente ? 'Guardar cambios' : 'Crear loteo'}
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

function EliminarLoteoDialog({ loteo, onCerrar }: { loteo: Loteo | null; onCerrar: () => void }) {
  const eliminar = useEliminarLoteo();
  return (
    <Dialog
      abierto={!!loteo}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo={`Eliminar el loteo «${loteo?.nombre ?? ''}»`}
      descripcion="El loteo no tiene sectores, así que se elimina por completo."
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variante="peligro"
            cargando={eliminar.isPending}
            onClick={() =>
              loteo &&
              eliminar.mutate(loteo.id, {
                onSuccess: () => {
                  toast.success(`Loteo «${loteo.nombre}» eliminado`);
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
