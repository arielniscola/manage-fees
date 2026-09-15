import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEBE_CAMBIAR_PASSWORD, type Rol } from '@mf/shared';
import type { Response } from 'express';
import { PERMITIR_PASSWORD_PENDIENTE, PUBLICO, ROLES, type RequestAutenticado } from './decorators';
import { aUsuarioSesion, COOKIE_SESION, SesionesService } from './sesiones.service';

/** Guard global: toda ruta requiere sesión salvo las marcadas con @Publico(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sesiones: SesionesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const destinos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, destinos)) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const token: unknown = req.cookies?.[COOKIE_SESION];
    const sesion = typeof token === 'string' && token ? await this.sesiones.validar(token) : null;

    if (!sesion) {
      if (token) this.sesiones.borrarCookie(res);
      throw new UnauthorizedException({ statusCode: 401, message: 'Tu sesión terminó. Ingresá de nuevo.' });
    }
    if (sesion.renovada) this.sesiones.escribirCookie(res, token as string);

    req.usuario = aUsuarioSesion(sesion.usuario);
    req.sesionId = sesion.sesionId;

    if (sesion.usuario.debeCambiarPassword && !this.reflector.getAllAndOverride<boolean>(PERMITIR_PASSWORD_PENDIENTE, destinos)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: DEBE_CAMBIAR_PASSWORD,
        message: 'Tenés que cambiar tu contraseña antes de continuar.',
      });
    }

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES, destinos);
    if (roles && !roles.includes(sesion.usuario.rol)) {
      throw new ForbiddenException({ statusCode: 403, message: 'No tenés permiso para esta sección.' });
    }
    return true;
  }
}
