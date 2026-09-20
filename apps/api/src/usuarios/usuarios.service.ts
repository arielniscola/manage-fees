import { Injectable } from '@nestjs/common';
import type { RestablecerPassword, UsuarioActualizar, UsuarioCrear, UsuarioListItem, UsuarioSesion } from '@mf/shared';
import type { Prisma, Usuario } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';
import { hashPassword } from '../auth/passwords';
import { SesionesService } from '../auth/sesiones.service';

const aListItem = (u: Usuario): UsuarioListItem => ({
  id: u.id,
  nombre: u.nombre,
  username: u.username,
  email: u.email,
  rol: u.rol,
  debeCambiarPassword: u.debeCambiarPassword,
  activo: u.activo,
  ultimoIngreso: u.ultimoIngreso?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
  ) {}

  async listar(): Promise<UsuarioListItem[]> {
    const usuarios = await this.prisma.usuario.findMany({ orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
    return usuarios.map(aListItem);
  }

  async crear({ password, ...data }: UsuarioCrear): Promise<UsuarioListItem> {
    try {
      const u = await this.prisma.usuario.create({
        data: { ...data, passwordHash: await hashPassword(password), debeCambiarPassword: true },
      });
      return aListItem(u);
    } catch (e) {
      throw traducirDuplicado(e);
    }
  }

  async actualizar(id: number, data: UsuarioActualizar, yo: UsuarioSesion): Promise<UsuarioListItem> {
    const usuario = await this.obtener(id);
    if (data.rol && data.rol !== usuario.rol) {
      if (id === yo.id) throw conflicto('No podés cambiar tu propio rol', 'rol');
      if (usuario.rol === 'SUPERADMIN' && usuario.activo) await this.exigirOtroSuperadmin(id);
    }
    try {
      return aListItem(await this.prisma.usuario.update({ where: { id }, data }));
    } catch (e) {
      throw traducirDuplicado(e);
    }
  }

  /** Desactiva al usuario y corta sus sesiones abiertas en el momento. */
  async desactivar(id: number, yo: UsuarioSesion): Promise<UsuarioListItem> {
    const usuario = await this.obtener(id);
    if (id === yo.id) throw conflicto('No podés desactivar tu propio usuario');
    if (!usuario.activo) throw conflicto('El usuario ya está desactivado');
    if (usuario.rol === 'SUPERADMIN') await this.exigirOtroSuperadmin(id);

    const [actualizado] = await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { activo: false } }),
      this.prisma.sesion.deleteMany({ where: { usuarioId: id } }),
    ]);
    return aListItem(actualizado);
  }

  async activar(id: number): Promise<UsuarioListItem> {
    const usuario = await this.obtener(id);
    if (usuario.activo) throw conflicto('El usuario ya está activo');
    return aListItem(await this.prisma.usuario.update({ where: { id }, data: { activo: true } }));
  }

  /** Asigna una contraseña temporal: el usuario la cambia al ingresar y se cierran sus sesiones. */
  async restablecerPassword(id: number, { password }: RestablecerPassword, yo: UsuarioSesion): Promise<UsuarioListItem> {
    await this.obtener(id);
    if (id === yo.id) throw conflicto('Para cambiar tu propia contraseña usá «Cambiar contraseña»');
    const [actualizado] = await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { passwordHash: await hashPassword(password), debeCambiarPassword: true } }),
      this.prisma.sesion.deleteMany({ where: { usuarioId: id } }),
    ]);
    return aListItem(actualizado);
  }

  private async obtener(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw noEncontrado('No existe el usuario');
    return usuario;
  }

  private async exigirOtroSuperadmin(excepto: number) {
    const where: Prisma.UsuarioWhereInput = { rol: 'SUPERADMIN', activo: true, id: { not: excepto } };
    if ((await this.prisma.usuario.count({ where })) === 0) {
      throw conflicto('Tiene que quedar al menos un superadmin activo');
    }
  }
}

/** Distingue cuál de los dos campos únicos chocó, para señalar el correcto en el formulario. */
function traducirDuplicado(e: unknown): unknown {
  if (!esDuplicado(e)) return e;
  const campos = String(e.meta?.target ?? '');
  if (campos.includes('username')) return conflicto('Ya existe un usuario con ese nombre de usuario', 'username');
  if (campos.includes('email')) return conflicto('Ya existe un usuario con ese email', 'email');
  return conflicto('Ya existe un usuario con esos datos');
}
