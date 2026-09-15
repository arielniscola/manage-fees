import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { LimitadorLogin } from './limitador';
import { SesionesService } from './sesiones.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SesionesService, LimitadorLogin, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SesionesService],
})
export class AuthModule {}
