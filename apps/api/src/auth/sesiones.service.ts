import { Injectable } from '@nestjs/common';
import type { UsuarioSesion } from '@mf/shared';
import type { Usuario } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.module';

export const COOKIE_SESION = 'mf_sesion';
const DURACION_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const aUsuarioSesion = (u: Usuario): UsuarioSesion => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  debeCambiarPassword: u.debeCambiarPassword,
});

@Injectable()
export class SesionesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(usuarioId: number, meta: { ip?: string; userAgent?: string }): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.sesion.create({
      data: {
        tokenHash: hashToken(token),
        usuarioId,
        expiraEn: new Date(Date.now() + DURACION_MS),
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return token;
  }

  /**
   * Devuelve la sesión si el token es válido y el usuario sigue activo.
   * La expiración se renueva cuando pasó la mitad del plazo, así una sesión en uso no se corta.
   */
  async validar(token: string): Promise<{ sesionId: number; usuario: Usuario; renovada: boolean } | null> {
    const sesion = await this.prisma.sesion.findUnique({ where: { tokenHash: hashToken(token) }, include: { usuario: true } });
    if (!sesion) return null;
    const ahora = Date.now();
    if (sesion.expiraEn.getTime() <= ahora || !sesion.usuario.activo) {
      await this.prisma.sesion.delete({ where: { id: sesion.id } }).catch(() => undefined);
      return null;
    }
    let renovada = false;
    if (sesion.expiraEn.getTime() - ahora < DURACION_MS / 2) {
      await this.prisma.sesion.update({ where: { id: sesion.id }, data: { expiraEn: new Date(ahora + DURACION_MS) } });
      renovada = true;
    }
    return { sesionId: sesion.id, usuario: sesion.usuario, renovada };
  }

  async cerrar(sesionId: number) {
    await this.prisma.sesion.deleteMany({ where: { id: sesionId } });
  }

  /** Cierra todas las sesiones del usuario, opcionalmente conservando la actual. */
  async cerrarTodas(usuarioId: number, exceptoSesionId?: number) {
    await this.prisma.sesion.deleteMany({
      where: { usuarioId, ...(exceptoSesionId && { id: { not: exceptoSesionId } }) },
    });
  }

  async limpiarVencidas() {
    await this.prisma.sesion.deleteMany({ where: { expiraEn: { lt: new Date() } } });
  }

  escribirCookie(res: Response, token: string) {
    res.cookie(COOKIE_SESION, token, { ...opcionesCookie(), maxAge: DURACION_MS });
  }

  borrarCookie(res: Response) {
    res.clearCookie(COOKIE_SESION, opcionesCookie());
  }
}

function opcionesCookie(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}
