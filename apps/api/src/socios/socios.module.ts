import { Module } from '@nestjs/common';
import { SociosController } from './socios.controller';
import { SociosService } from './socios.service';

@Module({
  controllers: [SociosController],
  providers: [SociosService],
})
export class SociosModule {}
