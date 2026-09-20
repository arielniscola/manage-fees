import { forwardRef, useEffect, type InputHTMLAttributes, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  ESTADOS_CIVILES,
  ETIQUETA_ESTADO_CIVIL,
  ETIQUETA_TIPO_SOCIO,
  TIPOS_SOCIO, hoy, socioCrearSchema, type SocioCrear, type SocioCrearInput } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, ErrorCarga } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { ApiError } from '@/lib/api';
import { nombreCompleto } from '@/lib/formato';
import { useActualizarSocio, useCrearSocio, useSocio } from './api';

type Campos = SocioCrearInput;

const vacio: Campos = {
  numero: undefined,
  tipo: 'TITULAR',
  nombre: '',
  apellido: '',
  dni: '',
  cuit: '',
  fechaNacimiento: '',
  estadoCivil: '',
  email: '',
  telefono: '',
  direccion: '',
  observaciones: '',
  fechaAlta: hoy(),
  confirmado: false,
  fotocopiaDni: false,
  actaMatrimonio: false,
};

export function SocioFormPage() {
  const { id } = useParams();
  const socioId = id ? Number(id) : undefined;
  const editando = !!socioId;
  const navigate = useNavigate();

  const socio = useSocio(socioId);
  const crear = useCrearSocio();
  const actualizar = useActualizarSocio(socioId ?? 0);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<Campos, unknown, SocioCrear>({ resolver: zodResolver(socioCrearSchema), defaultValues: vacio });

  useEffect(() => {
    if (socio.data) {
      const s = socio.data;
      reset({
        numero: s.numero,
        tipo: s.tipo,
        nombre: s.nombre,
        apellido: s.apellido,
        dni: s.dni,
        cuit: s.cuit ?? '',
        fechaNacimiento: s.fechaNacimiento ?? '',
        estadoCivil: s.estadoCivil ?? '',
        email: s.email ?? '',
        telefono: s.telefono ?? '',
        direccion: s.direccion ?? '',
        observaciones: s.observaciones ?? '',
        fechaAlta: s.fechaAlta,
        confirmado: s.confirmado,
        fotocopiaDni: s.fotocopiaDni,
        actaMatrimonio: s.actaMatrimonio,
      });
    }
  }, [socio.data, reset]);

  const guardando = crear.isPending || actualizar.isPending;

  const onSubmit = handleSubmit(async (datos) => {
    try {
      const guardado = editando ? await actualizar.mutateAsync(datos) : await crear.mutateAsync(datos);
      toast.success(editando ? 'Cambios guardados' : `${nombreCompleto(guardado)} quedó registrado con el N° ${guardado.numero}`);
      navigate(`/socios/${guardado.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.field && e.field in vacio) {
        setError(e.field as keyof Campos, { message: e.message }, { shouldFocus: true });
      } else {
        toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
      }
    }
  });

  if (editando && socio.isError) {
    return <ErrorCarga mensaje={socio.error.message} onReintentar={() => void socio.refetch()} />;
  }

  const volver = editando ? `/socios/${socioId}` : '/socios';

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/socios" className="hover:underline">Socios</Link> / {editando ? 'Editar' : 'Nuevo'}
          </>
        }
        titulo={editando ? (socio.data ? nombreCompleto(socio.data) : 'Editar socio') : 'Nuevo socio'}
      />

      <form onSubmit={onSubmit} noValidate className="max-w-[1000px]">
        <Card className="flex flex-col px-8 pb-6 pt-1">
          <Seccion titulo="Datos personales" descripcion="Tal como figuran en el documento." primera>
            <Field label="Nombre" htmlFor="nombre" requerido error={errors.nombre?.message}>
              <Input id="nombre" autoComplete="off" invalido={!!errors.nombre} {...register('nombre')} />
            </Field>
            <Field label="Apellido" htmlFor="apellido" requerido error={errors.apellido?.message}>
              <Input id="apellido" autoComplete="off" invalido={!!errors.apellido} {...register('apellido')} />
            </Field>
            <Field label="DNI" htmlFor="dni" requerido error={errors.dni?.message} ayuda="Con o sin puntos">
              <Input id="dni" inputMode="numeric" className="tabular" invalido={!!errors.dni} {...register('dni')} />
            </Field>
            <Field label="CUIT" htmlFor="cuit" error={errors.cuit?.message} ayuda="Opcional. Con o sin guiones">
              <Input id="cuit" inputMode="numeric" className="tabular" placeholder="20-31845300-5" invalido={!!errors.cuit} {...register('cuit')} />
            </Field>
            <Field label="Fecha de nacimiento" htmlFor="fechaNacimiento" error={errors.fechaNacimiento?.message}>
              <Input id="fechaNacimiento" type="date" className="tabular" invalido={!!errors.fechaNacimiento} {...register('fechaNacimiento')} />
            </Field>
            <Field label="Estado civil" htmlFor="estadoCivil" error={errors.estadoCivil?.message}>
              <Select id="estadoCivil" invalido={!!errors.estadoCivil} {...register('estadoCivil')}>
                <option value="">Sin indicar</option>
                {ESTADOS_CIVILES.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO_CIVIL[e]}
                  </option>
                ))}
              </Select>
            </Field>
          </Seccion>

          <Seccion titulo="Contacto" descripcion="Para enviar recibos y avisos de vencimiento.">
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="off" invalido={!!errors.email} {...register('email')} />
            </Field>
            <Field label="Teléfono" htmlFor="telefono" error={errors.telefono?.message}>
              <Input id="telefono" type="tel" placeholder="Ej.: 11 5555-5555" invalido={!!errors.telefono} {...register('telefono')} />
            </Field>
            <Field label="Dirección" htmlFor="direccion" error={errors.direccion?.message} className="col-span-2">
              <Input id="direccion" placeholder="Calle, número, piso, localidad" invalido={!!errors.direccion} {...register('direccion')} />
            </Field>
          </Seccion>

          <Seccion titulo="Membresía" descripcion="Si no indicás número, se asigna el siguiente disponible.">
            <Field label="N° de socio" htmlFor="numero" error={errors.numero?.message} ayuda={editando ? undefined : 'Automático si lo dejás vacío'}>
              <Input
                id="numero"
                inputMode="numeric"
                className="tabular"
                invalido={!!errors.numero}
                {...register('numero', { setValueAs: (v) => (v === '' || v == null ? undefined : v) })}
              />
            </Field>
            <Field label="Fecha de alta" htmlFor="fechaAlta" requerido error={errors.fechaAlta?.message}>
              <Input id="fechaAlta" type="date" className="tabular" invalido={!!errors.fechaAlta} {...register('fechaAlta')} />
            </Field>
            <Field
              label="Tipo de socio"
              htmlFor="tipo"
              requerido
              error={errors.tipo?.message}
              ayuda="Un suplente está en lista de espera: recibir una parcela lo vuelve titular"
            >
              <Select id="tipo" invalido={!!errors.tipo} {...register('tipo')}>
                {TIPOS_SOCIO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_SOCIO[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Observaciones" htmlFor="observaciones" error={errors.observaciones?.message} className="col-span-2">
              <Textarea id="observaciones" rows={3} invalido={!!errors.observaciones} {...register('observaciones')} />
            </Field>
          </Seccion>

          <Seccion titulo="Documentación" descripcion="Lo que el club ya recibió de este socio.">
            <div className="col-span-2 flex flex-wrap gap-x-8 gap-y-3">
              <Tilde id="confirmado" etiqueta="Confirmación" {...register('confirmado')} />
              <Tilde id="fotocopiaDni" etiqueta="Fotocopia del DNI" {...register('fotocopiaDni')} />
              <Tilde id="actaMatrimonio" etiqueta="Acta de matrimonio" {...register('actaMatrimonio')} />
            </div>
          </Seccion>

          <div className="flex justify-end gap-3 border-t border-borde pt-5">
            <Button variante="secundario" onClick={() => navigate(volver)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando} disabled={editando && !isDirty}>
              {editando ? 'Guardar cambios' : 'Guardar socio'}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}

function Seccion({ titulo, descripcion, primera, children }: { titulo: string; descripcion: string; primera?: boolean; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-1 gap-8 py-6 md:grid-cols-[220px_minmax(0,1fr)] ${primera ? '' : 'border-t border-borde'}`}>
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[19px] font-medium">{titulo}</h2>
        <p className="text-[13px] leading-normal text-tenue">{descripcion}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-[18px]">{children}</div>
    </div>
  );
}

/** Casilla de verificación con su etiqueta, para la lista de documentación. */
const Tilde = forwardRef<HTMLInputElement, { id: string; etiqueta: string } & InputHTMLAttributes<HTMLInputElement>>(
  function Tilde({ id, etiqueta, ...props }, ref) {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input ref={ref} id={id} type="checkbox" className="size-4 accent-pino-600" {...props} />
        {etiqueta}
      </label>
    );
  },
);
