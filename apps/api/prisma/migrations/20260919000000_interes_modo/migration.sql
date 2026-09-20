-- Modo del interés por mora: MENSUAL suma el porcentaje cada mes que la cuota sigue
-- impaga (lo que había hasta ahora); UNICO lo aplica una sola vez, el primer día de
-- aplicación después del vencimiento.
CREATE TYPE "ModoInteres" AS ENUM ('MENSUAL', 'UNICO');

ALTER TABLE "ConfiguracionInteres" ADD COLUMN "modo" "ModoInteres" NOT NULL DEFAULT 'MENSUAL';
