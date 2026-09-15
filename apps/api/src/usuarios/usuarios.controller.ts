import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  restablecerPasswordSchema,
  usuarioActualizarSchema,
  usuarioCrearSchema,
  type RestablecerPassword,
  type UsuarioActualizar,
  type UsuarioCrear,
  type UsuarioSesion,
} from '@mf/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Roles, UsuarioActual } from '../auth/decorators';
import { UsuariosService } from './usuarios.service';

@Roles('SUPERADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  crear(@Body(new ZodPipe(usuarioCrearSchema)) body: UsuarioCrear) {
    return this.usuarios.crear(body);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(usuarioActualizarSchema)) body: UsuarioActualizar,
    @UsuarioActual() yo: UsuarioSesion,
  ) {
    return this.usuarios.actualizar(id, body, yo);
  }

  @Post(':id/desactivar')
  @HttpCode(200)
  desactivar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() yo: UsuarioSesion) {
    return this.usuarios.desactivar(id, yo);
  }

  @Post(':id/activar')
  @HttpCode(200)
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.usuarios.activar(id);
  }

  @Post(':id/restablecer-password')
  @HttpCode(200)
  restablecerPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(restablecerPasswordSchema)) body: RestablecerPassword,
    @UsuarioActual() yo: UsuarioSesion,
  ) {
    return this.usuarios.restablecerPassword(id, body, yo);
  }
}
