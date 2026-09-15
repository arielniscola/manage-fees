# Gestión de socios

Sistema de gestión de socios, parcelas y cuota social.

- `apps/web`: React + Vite + Tailwind (sistema visual «Pino y Papel», ver `design/`)
- `apps/api`: NestJS + Prisma + PostgreSQL
- `packages/shared`: esquemas Zod y tipos compartidos entre web y API

## Primeros pasos

Requisitos: Node 22 y Docker.

```bash
npm install
docker compose up -d                 # PostgreSQL 16 en el puerto 5433
cp apps/api/.env.example apps/api/.env
npm run build:shared
npm run db:migrate
npm run db:seed                      # opcional: 36 parcelas y 6 socios de ejemplo

# Primer superadmin (muestra una contraseña temporal si no definís SUPERADMIN_PASSWORD)
npm run usuarios:superadmin -w @mf/api -- --email tesoreria@club.org --nombre "Tesorería"
```

Si se pierde el acceso de todos los superadmins, el mismo comando con `--forzar` y el email
de un usuario existente lo vuelve superadmin y le asigna una contraseña temporal nueva.

Para desarrollar, en dos terminales:

```bash
npm run dev:api    # http://localhost:3000/api
npm run dev:web    # http://localhost:5173
```

Si cambiás algo en `packages/shared`, volvé a correr `npm run build:shared`
(o dejá `npm run dev -w @mf/shared` corriendo).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run typecheck` | Verifica tipos de shared, API y web |
| `npm test` | Tests de los esquemas de validación |
| `npm run build` | Build de producción de todo el monorepo |
| `npm run db:migrate` | Aplica las migraciones pendientes |

## Usuarios y acceso

- **Administrador:** usa el sistema (socios, parcelas y los módulos que se sumen).
- **Superadmin:** además gestiona usuarios: alta, edición, rol, desactivación y contraseñas temporales.
- Toda la API requiere sesión, salvo `POST /api/auth/login`. La sesión es una cookie httpOnly de 12 horas que se renueva con el uso.
- Los usuarios nuevos o con contraseña restablecida deben cambiarla antes de usar el sistema.
- Desactivar un usuario o restablecer su contraseña cierra sus sesiones en el momento.
- Nadie puede desactivarse ni cambiarse el rol a sí mismo, y siempre queda al menos un superadmin activo.
- Login: 5 intentos fallidos por email (o 30 por IP) bloquean 15 minutos. El contador vive en memoria.
- Detrás de un proxy, definí `TRUST_PROXY` para que se registre la IP real.

| Método | Ruta | Quién |
| --- | --- | --- |
| POST | `/api/auth/login` · `/api/auth/logout` | Público · con sesión |
| GET | `/api/auth/yo` | Con sesión |
| POST | `/api/auth/cambiar-password` | Con sesión |
| GET · POST · PATCH | `/api/usuarios[/:id]` | Superadmin |
| POST | `/api/usuarios/:id/desactivar` · `/activar` · `/restablecer-password` | Superadmin |

## API (etapa 1)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/socios?q=&estado=activo\|baja\|todos&page=` | Listado y búsqueda por nombre, DNI, N° o parcela |
| GET | `/api/socios/:id` | Ficha con historial de parcelas |
| POST | `/api/socios` | Alta (el N° se asigna solo si no se indica) |
| PATCH | `/api/socios/:id` | Modificación |
| POST | `/api/socios/:id/baja` | Baja: libera sus parcelas con la misma fecha |
| POST | `/api/socios/:id/reactivar` | Reactivación |
| POST | `/api/socios/:id/asignaciones` | Asignar una parcela libre |
| POST | `/api/asignaciones/:id/liberar` | Liberar una parcela |
| GET | `/api/parcelas?q=&estado=libre\|asignada\|todas` | Listado de parcelas con titular |
| GET | `/api/parcelas/:id` | Parcela con historial de titulares |
| POST · PATCH · DELETE | `/api/parcelas[/:id]` | ABM (solo se eliminan parcelas nunca asignadas) |

Los errores tienen siempre la forma `{ statusCode, message, field? }`.

## Reglas de negocio implementadas

- El DNI y el N° de socio son únicos. El DNI se guarda sin puntos.
- La baja es lógica: el socio y su historial se conservan.
- Una parcela tiene como máximo una asignación vigente (índice único parcial en la base).
- Las fechas de asignación no pueden ser anteriores al alta del socio ni superponerse con el titular anterior.
- Una parcela con historial no se puede eliminar.
