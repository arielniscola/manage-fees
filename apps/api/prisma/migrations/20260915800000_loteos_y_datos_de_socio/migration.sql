-- El predio pasa a tener tres niveles: Loteo > Sector > Parcela. El loteo es el
-- fraccionamiento («Lavalle») y el sector la manzana dentro de él («7», «A-01»).

-- CreateTable
CREATE TABLE "Loteo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "direccion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loteo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loteo_nombre_key" ON "Loteo"("nombre");

-- «Lavalle» y «lavalle» son el mismo loteo.
CREATE UNIQUE INDEX "Loteo_nombre_insensible_key" ON "Loteo"(lower("nombre"));

ALTER TABLE "Loteo" ADD CONSTRAINT "Loteo_nombre_no_vacio_check"
    CHECK (length(btrim("nombre")) BETWEEN 1 AND 60);

-- AlterTable
ALTER TABLE "Sector" ADD COLUMN "loteoId" INTEGER;

-- CreateIndex
CREATE INDEX "Sector_loteoId_idx" ON "Sector"("loteoId");

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_loteoId_fkey" FOREIGN KEY ("loteoId") REFERENCES "Loteo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El nombre del sector deja de ser único en todo el sistema: la manzana 7 puede existir
-- en dos loteos distintos. Pasa a ser único dentro de su loteo.
DROP INDEX "Sector_nombre_key";
DROP INDEX "Sector_nombre_insensible_key";

CREATE UNIQUE INDEX "Sector_loteo_nombre_key" ON "Sector"("loteoId", lower("nombre")) WHERE "loteoId" IS NOT NULL;

-- Los sectores sin loteo siguen sin poder repetir nombre entre ellos: en Postgres dos
-- NULL no chocan, así que el caso necesita su propio índice.
CREATE UNIQUE INDEX "Sector_sin_loteo_nombre_key" ON "Sector"(lower("nombre")) WHERE "loteoId" IS NULL;

-- AlterTable: superficie del lote en metros cuadrados.
ALTER TABLE "Parcela" ADD COLUMN "superficieM2" DECIMAL(10,2);
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_superficie_positiva_check"
    CHECK ("superficieM2" IS NULL OR "superficieM2" > 0);

-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'SEPARADO', 'CONCUBINATO');

-- AlterTable: datos personales y documentación que el club junta de cada socio.
ALTER TABLE "Socio" ADD COLUMN "cuit" TEXT;
ALTER TABLE "Socio" ADD COLUMN "fechaNacimiento" DATE;
ALTER TABLE "Socio" ADD COLUMN "estadoCivil" "EstadoCivil";
ALTER TABLE "Socio" ADD COLUMN "confirmado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Socio" ADD COLUMN "fotocopiaDni" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Socio" ADD COLUMN "actaMatrimonio" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Socio_cuit_key" ON "Socio"("cuit");

-- El CUIT se guarda sin guiones. El dígito verificador lo valida la aplicación.
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_cuit_formato_check"
    CHECK ("cuit" IS NULL OR "cuit" ~ '^\d{11}$');

-- Rango de cordura para la fecha de nacimiento. No se compara contra la fecha de hoy
-- porque Postgres no acepta funciones no inmutables en un CHECK: que no sea futura lo
-- valida la aplicación.
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_nacimiento_razonable_check"
    CHECK ("fechaNacimiento" IS NULL OR "fechaNacimiento" >= DATE '1900-01-01');
