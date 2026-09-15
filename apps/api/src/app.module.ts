import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AsignacionesModule } from './asignaciones/asignaciones.module';
import { ParcelasModule } from './parcelas/parcelas.module';
import { PrismaModule } from './prisma/prisma.module';
import { SociosModule } from './socios/socios.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [PrismaModule, AuthModule, UsuariosModule, SociosModule, ParcelasModule, AsignacionesModule],
})
export class AppModule {}
