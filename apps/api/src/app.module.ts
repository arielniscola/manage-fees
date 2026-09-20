import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { AsignacionesModule } from './asignaciones/asignaciones.module';
import { AvisosModule } from './avisos/avisos.module';
import { CobrosModule } from './cobros/cobros.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { CuotasModule } from './cuotas/cuotas.module';
import { ParcelasModule } from './parcelas/parcelas.module';
import { PlanesModule } from './planes/planes.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportesModule } from './reportes/reportes.module';
import { SociosModule } from './socios/socios.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    PrismaModule,
    ConfiguracionModule,
    ScheduleModule.forRoot(),
    AuthModule,
    UsuariosModule,
    SociosModule,
    ParcelasModule,
    AsignacionesModule,
    CuotasModule,
    CobrosModule,
    PlanesModule,
    AvisosModule,
    ReportesModule,
  ],
})
export class AppModule {}
