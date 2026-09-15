import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ErroresFilter } from './common/errores.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Detrás de un proxy (nginx), para que req.ip sea la IP real del cliente.
  const proxy = process.env.TRUST_PROXY;
  if (proxy) app.set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ErroresFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
