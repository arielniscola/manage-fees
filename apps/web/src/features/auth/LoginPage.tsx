import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { loginSchema, type Login, type LoginInput } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useLogin, useYo } from './api';
import { PantallaAcceso } from './PantallaAcceso';

/** Solo se vuelve a rutas internas, nunca a una URL externa. */
function destinoSeguro(volver: string | null): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/panel';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const yo = useYo();
  const login = useLogin();
  const [verPassword, setVerPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput, unknown, Login>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  if (yo.data) return <Navigate to={destinoSeguro(params.get('volver'))} replace />;

  const onSubmit = handleSubmit((datos) =>
    login.mutate(datos, {
      onSuccess: (u) => navigate(u.debeCambiarPassword ? '/cambiar-password' : destinoSeguro(params.get('volver')), { replace: true }),
    }),
  );

  return (
    <PantallaAcceso titulo="Ingresar" descripcion="Usá el usuario y la contraseña que te dio el administrador del sistema.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {login.isError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-control border border-mor/25 bg-mor-fondo px-4 py-3 text-sm text-mor">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {login.error.message}
          </div>
        )}
        <Field label="Usuario" htmlFor="username" error={errors.username?.message}>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            invalido={!!errors.username}
            {...register('username')}
          />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={verPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              invalido={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-tenue hover:text-tinta"
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {verPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" cargando={login.isPending} className="mt-1 h-11">
          Ingresar
        </Button>
        <p className="text-[13px] text-tenue">¿Olvidaste tu contraseña? Pedile a un superadmin que te asigne una nueva.</p>
      </form>
    </PantallaAcceso>
  );
}
