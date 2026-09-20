-- El sector deja de ser un texto suelto en cada parcela y pasa a ser una entidad propia,
-- para que el club pueda darlos de alta y renombrarlos sin tocar parcela por parcela.

-- CreateTable
CREATE TABLE "Sector" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sector_nombre_key" ON "Sector"("nombre");

-- «Lavalle» y «lavalle» son el mismo sector: el nombre se guarda como lo escribieron,
-- pero no puede repetirse cambiando solo las mayúsculas.
CREATE UNIQUE INDEX "Sector_nombre_insensible_key" ON "Sector"(lower("nombre"));

ALTER TABLE "Sector" ADD CONSTRAINT "Sector_nombre_no_vacio_check"
    CHECK (length(btrim("nombre")) BETWEEN 1 AND 60);

-- Cada sector que hoy existe como texto pasa a ser una fila. Se ignoran los vacíos y,
-- si dos parcelas lo escribieron con distintas mayúsculas, queda una sola fila.
INSERT INTO "Sector" ("nombre", "updatedAt")
SELECT DISTINCT ON (lower(btrim("sector"))) btrim("sector"), CURRENT_TIMESTAMP
FROM "Parcela"
WHERE "sector" IS NOT NULL AND btrim("sector") <> ''
ORDER BY lower(btrim("sector")), btrim("sector");

ALTER TABLE "Parcela" ADD COLUMN "sectorId" INTEGER;

UPDATE "Parcela" p
SET "sectorId" = s."id"
FROM "Sector" s
WHERE p."sector" IS NOT NULL AND lower(btrim(p."sector")) = lower(s."nombre");

ALTER TABLE "Parcela" DROP COLUMN "sector";

-- CreateIndex
CREATE INDEX "Parcela_sectorId_idx" ON "Parcela"("sectorId");

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
