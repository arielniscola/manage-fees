import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import {
  cambiarPasswordSchema,
  loginSchema,
  type CambiarPassword,
  type Login,
  type UsuarioSesion,
} from '@mf/shared';
import type { Request, Response } from 'express';
import { reglaIncumplida } from '../common/errores';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.module';
import { PermitirPasswordPendiente, Publico, SesionActual, UsuarioActual } from './decorators';
import { CLAVE_IP, CLAVE_USUARIO, LimitadorLogin } from './limitador';
import { hashPassword, verificarPassword } from './passwords';
import { aUsuarioSesion, SesionesService } from './sesiones.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly limitador: LimitadorLogin,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) { username, password }: Login, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<UsuarioSesion> {
    const claves = [`${CLAVE_USUARIO}${username}`, `${CLAVE_IP}${req.ip}`];
    const espera = this.limitador.bloqueado(claves);
    if (espera > 0) {
      throw new HttpException(
        { statusCode: 429, message: `Demasiados intentos fallidos. Probá de nuevo en ${espera} ${espera === 1 ? 'minuto' : 'minutos'}.` },
        429,
      );
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { username } });
    // El mismo mensaje para usuario inexistente, inactivo o contraseña mala: no conviene
    // que desde afuera se pueda averiguar qué usuarios existen.
    const valida = await verificarPassword(usuario?.activo ? usuario.passwordHash : null, password);
    if (!usuario || !usuario.activo || !valida) {
      this.limitador.registrarFallo(claves);
      throw reglaIncumplida('El usuario o la contraseña no son correctos');
    }

    this.limitador.limpiar(claves);
    const token = await this.sesiones.crear(usuario.id, { ip: req.ip, userAgent: req.get('user-agent') });
    this.sesiones.escribirCookie(res, token);
    await this.prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoIngreso: new Date() } });
    void this.sesiones.limpiarVencidas();
    return aUsuarioSesion(usuario);
  }

  @PermitirPasswordPendiente()
  @Post('logout')
  @HttpCode(204)
  async logout(@SesionActual() sesionId: number, @Res({ passthrough: true }) res: Response) {
    await this.sesiones.cerrar(sesionId);
    this.sesiones.borrarCookie(res);
  }

  @PermitirPasswordPendiente()
  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioSesion): UsuarioSesion {
    return usuario;
  }

  /** Cambia la contraseña propia y cierra las demás sesiones abiertas del usuario. */
  @PermitirPasswordPendiente()
  @Post('cambiar-password')
  @HttpCode(200)
  async cambiarPassword(
    @Body(new ZodPipe(cambiarPasswordSchema)) { actual, nueva }: CambiarPassword,
    @UsuarioActual() yo: UsuarioSesion,
    @SesionActual() sesionId: number,
  ): Promise<UsuarioSesion> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: yo.id } });
    if (!(await verificarPassword(usuario.passwordHash, actual))) {
      throw reglaIncumplida('La contraseña actual no es correcta', 'actual');
    }
    const actualizado = await this.prisma.usuario.update({
      where: { id: yo.id },
      data: { passwordHash: await hashPassword(nueva), debeCambiarPassword: false },
    });
    await this.sesiones.cerrarTodas(yo.id, sesionId);
    return aUsuarioSesion(actualizado);
  }
}
