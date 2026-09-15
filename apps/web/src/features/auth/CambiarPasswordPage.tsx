import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cambiarPasswordSchema, PASSWORD_MIN, type CambiarPassword, type CambiarPasswordInput } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useCambiarPassword, useLogout, useYo } from './api';
import { PantallaAcceso } from './PantallaAcceso';

export function CambiarPasswordPage() {
  const navigate = useNavigate();
  const { data: usuario } = useYo();
  const cambiar = useCambiarPassword();
  const logout = useLogout();
  const obligatorio = !!usuario?.debeCambiarPassword;

  const { register, handleSubmit, setError, formState: { errors } } = useForm<CambiarPasswordInput, unknown, CambiarPassword>({
    resolver: zodResolver(cambiarPasswordSchema),
    defaultValues: { actual: '', nueva: '', confirmacion: '' },
  });

  const onSubmit = handleSubmit((datos) =>
    cambiar.mutate(datos, {
      onSuccess: () => {
        toast.success('Contraseña actualizada. Se cerraron tus otras sesiones abiertas.');
        navigate('/socios', { replace: true });
      },
      onError: (e) => {
        if (e instanceof ApiError && e.field === 'actual') setError('actual', { message: e.message }, { shouldFocus: true });
        else toast.error(e.message);
      },
    }),
  );

  return (
    <PantallaAcceso
      titulo={obligatorio ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
      descripcion={
        obligatorio
          ? `Hola, ${usuario?.nombre}. Estás usando una contraseña temporal: reemplazala por una propia para continuar.`
          : 'Al guardarla se cierran tus sesiones abiertas en otros dispositivos.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field label={obligatorio ? 'Contraseña temporal' : 'Contraseña actual'} htmlFor="actual" error={errors.actual?.message}>
          <Input id="actual" type="password" autoComplete="current-password" autoFocus invalido={!!errors.actual} {...register('actual')} />
        </Field>
        <Field
          label="Contraseña nueva"
          htmlFor="nueva"
          error={errors.nueva?.message}
          ayuda={`Al menos ${PASSWORD_MIN} caracteres, combinando letras y números`}
        >
          <Input id="nueva" type="password" autoComplete="new-password" invalido={!!errors.nueva} {...register('nueva')} />
        </Field>
        <Field label="Repetí la contraseña nueva" htmlFor="confirmacion" error={errors.confirmacion?.message}>
          <Input id="confirmacion" type="password" autoComplete="new-password" invalido={!!errors.confirmacion} {...register('confirmacion')} />
        </Field>
        <Button type="submit" cargando={cambiar.isPending} className="mt-1 h-11">
          Guardar contraseña
        </Button>
        {obligatorio ? (
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/ingresar', { replace: true }) })}
            className="self-start text-[13px] font-medium text-tenue hover:text-tinta hover:underline"
          >
            Salir sin cambiarla
          </button>
        ) : (
          <Link to="/socios" className="self-start text-[13px] font-medium text-pino-600 hover:underline">
            Volver
          </Link>
        )}
      </form>
    </PantallaAcceso>
  );
}
