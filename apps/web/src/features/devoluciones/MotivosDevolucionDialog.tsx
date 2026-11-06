import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { motivoDevolucionSchema, type MotivoDevolucion } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { plural } from '@/lib/formato';
import { useActualizarMotivoDevolucion, useCrearMotivoDevolucion, useMotivosDevolucion } from './api';

/**
 * La lista de motivos que se ofrece al registrar una devolución. Uno ya usado no se borra:
 * se desactiva y deja de ofrecerse, y las devoluciones hechas conservan su texto.
 */
export function MotivosDevolucionDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { data, isPending, isError, error } = useMotivosDevolucion();
  const crear = useCrearMotivoDevolucion();
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState<string>();

  useEffect(() => {
    if (abierto) {
      setNombre('');
      setErrorNombre(undefined);
    }
  }, [abierto]);

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = motivoDevolucionSchema.safeParse({ nombre });
    if (!r.success) return setErrorNombre(r.error.issues[0]?.message);
    crear.mutate(r.data, {
      onSuccess: (m) => {
        toast.success(`Motivo «${m.nombre}» agregado.`);
        setNombre('');
        setErrorNombre(undefined);
      },
      onError: (e) => setErrorNombre(e.message),
    });
  };

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo="Motivos de devolución"
      descripcion="Los que se ofrecen al registrar una devolución. Un motivo desactivado deja de ofrecerse; las devoluciones ya hechas conservan su texto."
      pie={
        <Button variante="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <form onSubmit={agregar} noValidate className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              id="nuevo-motivo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nuevo motivo, por ejemplo: Pago duplicado"
              aria-label="Nuevo motivo"
              invalido={!!errorNombre}
            />
            <Button type="submit" cargando={crear.isPending}>
              <Plus /> Agregar
            </Button>
          </div>
          {errorNombre && <span className="text-xs text-mor">{errorNombre}</span>}
        </form>

        {isError ? (
          <p className="py-6 text-center text-sm text-mor">{error.message}</p>
        ) : isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
        ) : data.length === 0 ? (
          <p className="py-6 text-center text-sm text-tenue">Todavía no hay motivos. Agregá el primero.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde rounded-control border border-borde">
            {data.map((m) => (
              <FilaMotivo key={m.id} motivo={m} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function FilaMotivo({ motivo }: { motivo: MotivoDevolucion }) {
  const actualizar = useActualizarMotivoDevolucion();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(motivo.nombre);
  const [errorNombre, setErrorNombre] = useState<string>();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = motivoDevolucionSchema.safeParse({ nombre });
    if (!r.success) return setErrorNombre(r.error.issues[0]?.message);
    if (r.data.nombre === motivo.nombre) return setEditando(false);
    actualizar.mutate(
      { id: motivo.id, nombre: r.data.nombre },
      {
        onSuccess: () => {
          toast.success('Motivo renombrado.');
          setEditando(false);
        },
        onError: (e) => setErrorNombre(e.message),
      },
    );
  };

  const alternar = () =>
    actualizar.mutate(
      { id: motivo.id, activo: !motivo.activo },
      {
        onSuccess: (m) => toast.success(m.activo ? `«${m.nombre}» se vuelve a ofrecer.` : `«${m.nombre}» ya no se ofrece.`),
        onError: (e) => toast.error(e.message),
      },
    );

  if (editando) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={guardar} noValidate className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              id={`motivo-${motivo.id}`}
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-label="Nombre del motivo"
              invalido={!!errorNombre}
            />
            <Button type="submit" tamanio="sm" cargando={actualizar.isPending}>
              Guardar
            </Button>
            <Button
              variante="terciario"
              tamanio="sm"
              onClick={() => {
                setNombre(motivo.nombre);
                setErrorNombre(undefined);
                setEditando(false);
              }}
            >
              Cancelar
            </Button>
          </div>
          {errorNombre && <span className="text-xs text-mor">{errorNombre}</span>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="flex min-w-0 flex-col">
        <span className={`truncate text-sm font-medium ${motivo.activo ? '' : 'text-tenue'}`}>{motivo.nombre}</span>
        <span className="text-xs text-tenue">
          {motivo.usos === 0 ? 'Sin usar' : `En ${plural(motivo.usos, 'devolución', 'devoluciones')}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {!motivo.activo && <Badge tono="baja">Inactivo</Badge>}
        <Button variante="terciario" tamanio="sm" onClick={() => setEditando(true)} aria-label={`Renombrar «${motivo.nombre}»`}>
          <Pencil /> Renombrar
        </Button>
        <Button variante="secundario" tamanio="sm" cargando={actualizar.isPending} onClick={alternar}>
          {motivo.activo ? 'Desactivar' : 'Activar'}
        </Button>
      </span>
    </li>
  );
}
