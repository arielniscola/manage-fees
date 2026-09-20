import 'reflect-metadata';
// Antes que cualquier módulo: varios leen su configuración al cargarse.
import './env';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  servirWeb(app);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}

/**
 * En producción la API también sirve el build de la web, así las dos comparten dominio y
 * la cookie de sesión funciona sin CORS. Las rutas que no son de la API ni un archivo
 * del build devuelven `index.html`, y la navegación la resuelve el router de React.
 * En desarrollo el build no existe (o se usa Vite en el 5173) y esto no hace nada.
 */
function servirWeb(app: NestExpressApplication) {
  const carpeta = process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist');
  const indice = join(carpeta, 'index.html');
  if (!existsSync(indice)) return;

  app.useStaticAssets(carpeta, { index: false, maxAge: '1y', immutable: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
    // El index no se cachea: tiene que apuntar siempre a los archivos del último deploy.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
}

void bootstrap();
