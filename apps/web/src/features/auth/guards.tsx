import type { ReactNode } from 'react';
import { LogoCooperativa } from '@/components/LogoCooperativa';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Rol } from '@mf/shared';
import { ErrorCarga } from '@/components/ui/display';
import { useEventosSesion, useYo } from './api';

/** Protege las rutas internas: sin sesión va al ingreso; con contraseña pendiente, a cambiarla. */
export function RequireAuth() {
  useEventosSesion();
  const { data: usuario, isPending, isError, error, refetch } = useYo();
  const { pathname, search } = useLocation();

  if (isPending) return <Cargando />;
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      </div>
    );
  }
  if (!usuario) {
    const volver = pathname !== '/' ? `?volver=${encodeURIComponent(pathname + search)}` : '';
    return <Navigate to={`/ingresar${volver}`} replace />;
  }
  if (usuario.debeCambiarPassword && pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }
  return <Outlet />;
}

export function RequireRol({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { data: usuario } = useYo();
  if (usuario?.rol !== rol) return <Navigate to="/socios" replace />;
  return <>{children}</>;
}

function Cargando() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true" aria-label="Cargando">
      <LogoCooperativa className="size-8 animate-pulse text-pino-300" strokeWidth={1.6} />
    </div>
  );
}
