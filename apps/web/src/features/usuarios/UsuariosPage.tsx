import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, KeyRound, Pencil, Plus, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_ROL,
  PASSWORD_MIN,
  restablecerPasswordSchema,
  ROLES,
  usuarioActualizarSchema,
  usuarioCrearSchema,
  type RestablecerPassword,
  type RestablecerPasswordInput,
  type UsuarioCrear,
  type UsuarioCrearInput,
  type UsuarioListItem,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, ErrorCarga, FilasCargando, Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { ApiError } from '@/lib/api';
import { plural } from '@/lib/formato';
import { useYo } from '../auth/api';
import {
  generarPasswordTemporal,
  useActualizarUsuario,
  useCambiarEstadoUsuario,
  useCrearUsuario,
  useRestablecerPassword,
  useUsuarios,
} from './api';

const fechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso))
    : null;

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function UsuariosPage() {
  const { data: yo } = useYo();
  const { data, isPending, isError, error, refetch } = useUsuarios();
  const [editando, setEditando] = useState<UsuarioListItem | 'nuevo' | null>(null);
  const [restableciendo, setRestableciendo] = useState<UsuarioListItem | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState<UsuarioListItem | null>(null);

  const activos = data?.filter((u) => u.activo).length ?? 0;

  return (
    <>
      <Encabezado
        antetitulo={data ? `${plural(activos, 'usuario activo', 'usuarios activos')}` : ' '}
        titulo="Usuarios"
        acciones={
          <Button onClick={() => setEditando('nuevo')}>
            <Plus /> Nuevo usuario
          </Button>
        }
      />

      <Card>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Último ingreso</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <FilasCargando columnas={5} filas={3} />
              ) : (
                data.map((u) => {
                  const soyYo = u.id === yo?.id;
                  return (
                    <tr key={u.id} className={u.activo ? undefined : 'text-tenue'}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar texto={iniciales(u.nombre)} />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {u.nombre}
                              {soyYo && <span className="ml-2 text-xs font-normal text-tenue">(vos)</span>}
                            </span>
                            <span className="text-xs text-tenue">
                              <span className="font-mono">{u.username}</span> · {u.email}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge tono={u.rol === 'SUPERADMIN' ? 'pino' : 'baja'} punto={false}>
                          {ETIQUETA_ROL[u.rol]}
                        </Badge>
                      </Td>
                      <Td>
                        {!u.activo ? (
                          <Badge tono="baja">Desactivado</Badge>
                        ) : u.debeCambiarPassword ? (
                          <Badge tono="pend">Contraseña temporal</Badge>
                        ) : (
                          <Badge tono="ok">Activo</Badge>
                        )}
                      </Td>
                      <Td className="tabular text-tenue">{fechaHora(u.ultimoIngreso) ?? 'Nunca ingresó'}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <IconoBoton etiqueta={`Editar a ${u.nombre}`} onClick={() => setEditando(u)}>
                            <Pencil />
                          </IconoBoton>
                          {!soyYo && (
                            <>
                              <IconoBoton etiqueta={`Asignar contraseña temporal a ${u.nombre}`} onClick={() => setRestableciendo(u)}>
                                <KeyRound />
                              </IconoBoton>
                              <IconoBoton
                                etiqueta={u.activo ? `Desactivar a ${u.nombre}` : `Reactivar a ${u.nombre}`}
                                onClick={() => setCambiandoEstado(u)}
                                peligro={u.activo}
                              >
                                {u.activo ? <UserX /> : <UserCheck />}
                              </IconoBoton>
                            </>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Tabla>
        )}
      </Card>

      <p className="max-w-2xl text-[13px] leading-relaxed text-tenue">
        Los <strong className="font-semibold text-tinta">administradores</strong> usan el sistema día a día. Los{' '}
        <strong className="font-semibold text-tinta">superadmins</strong> además crean usuarios, les asignan contraseñas temporales y
        pueden desactivarlos. Siempre tiene que quedar al menos un superadmin activo.
      </p>

      <UsuarioDialog usuario={editando} esYo={editando !== 'nuevo' && editando?.id === yo?.id} onCerrar={() => setEditando(null)} />
      <RestablecerDialog usuario={restableciendo} onCerrar={() => setRestableciendo(null)} />
      <EstadoDialog usuario={cambiandoEstado} onCerrar={() => setCambiandoEstado(null)} />
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

function CampoPasswordTemporal({ id, error, valor, onGenerar, registro }: {
  id: string;
  error?: string;
  valor: string;
  onGenerar: () => void;
  registro: UseFormRegisterReturn;
}) {
  return (
    <Field label="Contraseña temporal" htmlFor={id} requerido error={error} ayuda={`Al menos ${PASSWORD_MIN} caracteres con letras y números. Se pide cambiarla al ingresar.`}>
      <div className="flex gap-2">
        <Input id={id} autoComplete="off" spellCheck={false} className="font-mono tabular" invalido={!!error} {...registro} />
        <Button variante="secundario" onClick={onGenerar} title="Generar otra" aria-label="Generar otra contraseña" className="px-3">
          <RefreshCw />
        </Button>
        <Button
          variante="secundario"
          title="Copiar"
          aria-label="Copiar contraseña"
          className="px-3"
          disabled={!valor}
          onClick={() => navigator.clipboard.writeText(valor).then(() => toast.success('Contraseña copiada'), () => toast.error('No se pudo copiar'))}
        >
          <Copy />
        </Button>
      </div>
    </Field>
  );
}

const crearResolver = zodResolver(usuarioCrearSchema);

function UsuarioDialog({ usuario, esYo, onCerrar }: { usuario: UsuarioListItem | 'nuevo' | null; esYo: boolean; onCerrar: () => void }) {
  const existente = usuario && usuario !== 'nuevo' ? usuario : null;
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();
  // El resolver se fija al montar el formulario: una ref le indica si se está editando.
  const editandoRef = useRef(false);
  editandoRef.current = !!existente;
  const { register, handleSubmit, reset, setError, setValue, watch, formState: { errors } } = useForm<UsuarioCrearInput, unknown, UsuarioCrear>({
    // Al editar no se pide contraseña, así que se valida con el esquema parcial.
    resolver: (valores, ctx, opciones) =>
      editandoRef.current
        ? (zodResolver(usuarioActualizarSchema) as unknown as typeof crearResolver)(valores, ctx, opciones)
        : crearResolver(valores, ctx, opciones),
  });

  useEffect(() => {
    if (usuario) {
      reset(
        existente
          ? { nombre: existente.nombre, username: existente.username, email: existente.email, rol: existente.rol, password: '' }
          : { nombre: '', username: '', email: '', rol: 'ADMIN', password: generarPasswordTemporal() },
      );
    }
  }, [usuario, existente, reset]);

  const guardando = crear.isPending || actualizar.isPending;
  const password = watch('password') ?? '';

  const onSubmit = handleSubmit(async (datos) => {
    try {
      if (existente) {
        await actualizar.mutateAsync({
          id: existente.id,
          nombre: datos.nombre,
          username: datos.username,
          email: datos.email,
          rol: datos.rol,
        });
        toast.success('Usuario actualizado');
      } else {
        const u = await crear.mutateAsync(datos);
        toast.success(`Usuario creado. Pasale a ${u.nombre} su usuario «${u.username}» y la contraseña temporal.`);
      }
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError && e.field && ['nombre', 'username', 'email', 'rol', 'password'].includes(e.field)) {
        setError(e.field as keyof UsuarioCrearInput, { message: e.message }, { shouldFocus: true });
      } else {
        toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
      }
    }
  });

  return (
    <Dialog
      abierto={!!usuario}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={existente ? 'Editar usuario' : 'Nuevo usuario'}
      ancho="sm"
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button form="form-usuario" type="submit" cargando={guardando}>
            {existente ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form id="form-usuario" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="usuario-nombre" requerido error={errors.nombre?.message}>
          <Input id="usuario-nombre" autoFocus autoComplete="off" invalido={!!errors.nombre} {...register('nombre')} />
        </Field>
        <Field
          label="Usuario"
          htmlFor="usuario-username"
          requerido
          error={errors.username?.message}
          ayuda="Con esto ingresa al sistema. Letras, números, punto, guion y guion bajo."
        >
          <Input
            id="usuario-username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
            placeholder="tesoreria"
            invalido={!!errors.username}
            {...register('username')}
          />
        </Field>
        <Field label="Email" htmlFor="usuario-email" requerido error={errors.email?.message} ayuda="Para contacto; no sirve para ingresar">
          <Input id="usuario-email" type="email" autoComplete="off" invalido={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Rol" htmlFor="usuario-rol" requerido error={errors.rol?.message} ayuda={esYo ? 'No podés cambiar tu propio rol' : undefined}>
          <Select id="usuario-rol" disabled={esYo} invalido={!!errors.rol} {...register('rol')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
            ))}
          </Select>
        </Field>
        {!existente && (
          <CampoPasswordTemporal
            id="usuario-password"
            error={errors.password?.message}
            valor={password}
            onGenerar={() => setValue('password', generarPasswordTemporal(), { shouldValidate: true })}
            registro={register('password')}
          />
        )}
      </form>
    </Dialog>
  );
}

function RestablecerDialog({ usuario, onCerrar }: { usuario: UsuarioListItem | null; onCerrar: () => void }) {
  const restablecer = useRestablecerPassword();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<RestablecerPasswordInput, unknown, RestablecerPassword>({
    resolver: zodResolver(restablecerPasswordSchema),
  });

  useEffect(() => {
    if (usuario) reset({ password: generarPasswordTemporal() });
  }, [usuario, reset]);

  const onSubmit = handleSubmit((datos) => {
    if (!usuario) return;
    restablecer.mutate(
      { id: usuario.id, ...datos },
      {
        onSuccess: () => {
          toast.success(`Contraseña temporal asignada a ${usuario.nombre}`);
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  });

  return (
    <Dialog
      abierto={!!usuario}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo="Asignar contraseña temporal"
      ancho="sm"
      descripcion={usuario ? `${usuario.nombre} va a tener que cambiarla al ingresar. Sus sesiones abiertas se cierran ahora.` : undefined}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button form="form-restablecer" type="submit" cargando={restablecer.isPending}>Asignar contraseña</Button>
        </>
      }
    >
      <form id="form-restablecer" onSubmit={onSubmit} noValidate>
        <CampoPasswordTemporal
          id="restablecer-password"
          error={errors.password?.message}
          valor={watch('password') ?? ''}
          onGenerar={() => setValue('password', generarPasswordTemporal(), { shouldValidate: true })}
          registro={register('password')}
        />
      </form>
    </Dialog>
  );
}

function EstadoDialog({ usuario, onCerrar }: { usuario: UsuarioListItem | null; onCerrar: () => void }) {
  const cambiar = useCambiarEstadoUsuario();
  const desactivar = !!usuario?.activo;
  return (
    <Dialog
      abierto={!!usuario}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={desactivar ? `Desactivar a ${usuario?.nombre}` : `Reactivar a ${usuario?.nombre}`}
      ancho="sm"
      descripcion={
        desactivar
          ? 'No va a poder ingresar y sus sesiones abiertas se cierran en el momento. Podés reactivarlo cuando quieras.'
          : 'Va a poder ingresar de nuevo con su contraseña actual.'
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button
            variante={desactivar ? 'peligro' : 'primario'}
            cargando={cambiar.isPending}
            onClick={() =>
              usuario &&
              cambiar.mutate(
                { id: usuario.id, activo: !desactivar },
                {
                  onSuccess: () => {
                    toast.success(desactivar ? `${usuario.nombre} fue desactivado` : `${usuario.nombre} fue reactivado`);
                    onCerrar();
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {desactivar ? 'Desactivar' : 'Reactivar'}
          </Button>
        </>
      }
    />
  );
}
