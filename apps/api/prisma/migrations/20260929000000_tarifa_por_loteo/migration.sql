-- La cuota de parcela puede tener un precio distinto en cada loteo («Lavalle» 3.000,
-- «Maipú» 3.500). Una tarifa con loteo solo valoriza las parcelas de ese loteo; las que no
-- tienen loteo, o cuyo loteo no tiene tarifa propia, siguen con la general.
ALTER TABLE "Tarifa" ADD COLUMN "loteoId" INTEGER;

ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_loteoId_fkey"
    FOREIGN KEY ("loteoId") REFERENCES "Loteo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Tarifa_loteoId_idx" ON "Tarifa"("loteoId");

-- La cuota social es una por socio: no depende de ningún loteo.
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_loteo_solo_parcela_check"
    CHECK ("loteoId" IS NULL OR "alcance" = 'PARCELA');

-- El mes de vigencia es único dentro de cada historial: el general de cada alcance y el
-- propio de cada loteo. Dos índices parciales porque en Postgres los NULL no chocan.
DROP INDEX "Tarifa_alcance_vigenteDesde_key";
CREATE UNIQUE INDEX "Tarifa_alcance_vigenteDesde_key"
    ON "Tarifa"("alcance", "vigenteDesde")
    WHERE "loteoId" IS NULL;
CREATE UNIQUE INDEX "Tarifa_loteo_vigenteDesde_key"
    ON "Tarifa"("loteoId", "vigenteDesde")
    WHERE "loteoId" IS NOT NULL;
