-- El código de la parcela deja de ser único en todo el sistema y pasa a serlo dentro de
-- su sector: el lote 1 de la manzana 7 de Lavalle y el lote 1 de la manzana 7 de Maipú
-- son dos parcelas distintas. Es la misma regla que ya rige para el nombre del sector
-- dentro de su loteo.
DROP INDEX "Parcela_codigo_key";

-- «7-1» y «7-A» se guardan como los escribieron, pero no se repiten dentro del sector
-- cambiando solo las mayúsculas.
CREATE UNIQUE INDEX "Parcela_sector_codigo_key" ON "Parcela"("sectorId", lower("codigo")) WHERE "sectorId" IS NOT NULL;

-- Las parcelas que todavía no están en ningún sector siguen sin poder repetir código
-- entre ellas: en Postgres dos NULL no chocan, así que el caso necesita su propio índice.
CREATE UNIQUE INDEX "Parcela_sin_sector_codigo_key" ON "Parcela"(lower("codigo")) WHERE "sectorId" IS NULL;
