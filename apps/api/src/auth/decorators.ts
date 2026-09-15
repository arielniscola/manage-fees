import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Rol, UsuarioSesion } from '@mf/shared';
import type { Request } from 'express';

export const PUBLICO = 'auth:publico';
export const ROLES = 'auth:roles';
export const PERMITIR_PASSWORD_PENDIENTE = 'auth:passwordPendiente';

/** La ruta no requiere sesión (por ejemplo, el login). */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Solo los roles indicados pueden usar la ruta. Sin este decorador, alcanza con estar logueado. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

/** La ruta se puede usar aunque el usuario todavía tenga que cambiar su contraseña. */
export const PermitirPasswordPendiente = () => SetMetadata(PERMITIR_PASSWORD_PENDIENTE, true);

export interface RequestAutenticado extends Request {
  usuario?: UsuarioSesion;
  sesionId?: number;
}

export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioSesion => {
  return ctx.switchToHttp().getRequest<RequestAutenticado>().usuario!;
});

export const SesionActual = createParamDecorator((_: unknown, ctx: ExecutionContext): number => {
  return ctx.switchToHttp().getRequest<RequestAutenticado>().sesionId!;
});
