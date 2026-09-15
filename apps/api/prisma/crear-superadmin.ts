/**
 * Crea el primer superadmin del sistema.
 *
 * Uso:
 *   npm run usuarios:superadmin -w @mf/api -- --email tesoreria@club.org --nombre "Tesorería"
 *
 * La contraseña se toma de SUPERADMIN_PASSWORD o, si no está, se genera una temporal
 * y se muestra una sola vez. En el primer ingreso se pide cambiarla.
 */
import { passwordNuevaSchema, usuarioCrearSchema } from '@mf/shared';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword } from '../src/auth/passwords';

const prisma = new PrismaClient();

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, nombre: { type: 'string' }, forzar: { type: 'boolean', default: false } },
  });

  const existentes = await prisma.usuario.count({ where: { rol: 'SUPERADMIN', activo: true } });
  if (existentes > 0 && !values.forzar) {
    console.log(`Ya hay ${existentes} superadmin activo. Usá --forzar para crear otro.`);
    return;
  }

  const generada = !process.env.SUPERADMIN_PASSWORD;
  const password = process.env.SUPERADMIN_PASSWORD ?? `Pino${randomBytes(9).toString('base64url')}7`;
  const pass = passwordNuevaSchema.safeParse(password);
  if (!pass.success) throw new Error(`SUPERADMIN_PASSWORD: ${pass.error.issues[0]?.message}`);

  const datos = usuarioCrearSchema.safeParse({ email: values.email, nombre: values.nombre, rol: 'SUPERADMIN', password });
  if (!datos.success) {
    const i = datos.error.issues[0];
    throw new Error(`--${i?.path.join('.')}: ${i?.message}`);
  }

  const { email, nombre } = datos.data;
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { rol: 'SUPERADMIN', activo: true, passwordHash: await hashPassword(password), debeCambiarPassword: true },
    create: { email, nombre, rol: 'SUPERADMIN', passwordHash: await hashPassword(password), debeCambiarPassword: true },
  });

  console.log(`Superadmin listo: ${usuario.nombre} <${usuario.email}>`);
  if (generada) console.log(`Contraseña temporal (se muestra una sola vez): ${password}`);
  console.log('Al ingresar por primera vez se va a pedir cambiarla.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
