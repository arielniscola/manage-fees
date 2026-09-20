-- El ingreso pasa a ser por nombre de usuario. El email se conserva para contacto,
-- pero deja de servir para entrar al sistema.
ALTER TABLE "Usuario" ADD COLUMN "username" TEXT;

-- A los usuarios que ya existen se les arma el username con la parte del email anterior
-- a la arroba, limpiada de lo que no sea una letra, un número, punto, guion o guion bajo.
UPDATE "Usuario"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^A-Za-z0-9._-]', '', 'g'));

-- Si quedó vacío o demasiado corto, o no arranca y termina en letra o número, se usa un
-- nombre armado con el id. Nadie queda sin poder entrar.
UPDATE "Usuario"
SET "username" = 'usuario' || "id"
WHERE "username" IS NULL
   OR length("username") < 3
   OR "username" !~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$';

-- Dos emails distintos pueden compartir la parte de adelante: al segundo y siguientes
-- se les agrega el id para que no choquen.
UPDATE "Usuario" u
SET "username" = u."username" || '-' || u."id"
WHERE EXISTS (
    SELECT 1 FROM "Usuario" o WHERE o."username" = u."username" AND o."id" < u."id"
);

ALTER TABLE "Usuario" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

-- El username se guarda siempre en minúsculas y con el mismo formato que valida la app,
-- así «Tesoreria» y «tesoreria» no pueden convivir como dos usuarios distintos.
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_username_formato_check"
    CHECK ("username" ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$' AND length("username") BETWEEN 3 AND 30);
