-- En los loteos que cobran por parcela, el importe sale de la parcela: la cuota se genera
-- aunque el loteo no tenga tarifa, así que la de parcela ya no exige una.
ALTER TABLE "Cuota" DROP CONSTRAINT "Cuota_origen_coherente_check";
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_origen_coherente_check" CHECK (
    ("origen" = 'PARCELA'
        AND "asignacionId" IS NOT NULL AND "parcelaId" IS NOT NULL
        AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
    OR
    ("origen" = 'SOCIO'
        AND ("tarifaId" IS NOT NULL OR "historica")
        AND "asignacionId" IS NULL AND "parcelaId" IS NULL AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
    OR
    ("origen" = 'PLAN'
        AND "planId" IS NOT NULL AND "numeroEnPlan" IS NOT NULL
        AND "asignacionId" IS NULL AND "parcelaId" IS NULL AND "tarifaId" IS NULL)
    OR
    ("origen" = 'ANTICIPO'
        AND "asignacionId" IS NOT NULL AND "parcelaId" IS NOT NULL
        AND "tarifaId" IS NULL AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
);
