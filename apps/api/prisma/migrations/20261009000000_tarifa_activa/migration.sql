-- Una tarifa que ya generó cuotas no se puede borrar: se desactiva. Deja de valorizar los
-- períodos que todavía no se generaron y su historial sigue con las demás activas.
ALTER TABLE "Tarifa" ADD COLUMN "activa" BOOLEAN NOT NULL DEFAULT true;

-- El mes de vigencia sigue siendo único dentro de cada historial, pero solo entre las
-- activas: una desactivada no impide cargar otra que rija desde el mismo mes.
DROP INDEX "Tarifa_alcance_vigenteDesde_key";
CREATE UNIQUE INDEX "Tarifa_alcance_vigenteDesde_key"
    ON "Tarifa"("alcance", "vigenteDesde")
    WHERE "loteoId" IS NULL AND "activa";
DROP INDEX "Tarifa_loteo_vigenteDesde_key";
CREATE UNIQUE INDEX "Tarifa_loteo_vigenteDesde_key"
    ON "Tarifa"("loteoId", "vigenteDesde")
    WHERE "loteoId" IS NOT NULL AND "activa";
