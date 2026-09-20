import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Carga `apps/api/.env` en el proceso. Los comandos de Prisma leen ese archivo solos,
 * pero `nest start` y `node dist/main.js` no: sin esto la API arranca sin DATABASE_URL.
 *
 * Se importa antes que nada en `main.ts`, porque varios módulos leen su configuración
 * al cargarse. En producción, donde las variables vienen del entorno, el archivo no está
 * y no pasa nada; si está, lo que ya venga del entorno tiene prioridad.
 */
const archivo = join(__dirname, '..', '.env');
if (existsSync(archivo)) process.loadEnvFile(archivo);
