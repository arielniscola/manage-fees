-- Algunos loteos cobran un anticipo de entrada: un pago único que hace el socio cuando
-- recibe una parcela libre. El loteo guarda un importe sugerido, que se puede cambiar al
-- asignar; la cuota queda colgada de esa asignación.
ALTER TABLE "Loteo" ADD COLUMN "cobraAnticipo" BOOLEAN NOT NULL DEFAULT false;
-- Centavos. Opcional: sin sugerido, el importe se escribe en cada asignación.
ALTER TABLE "Loteo" ADD COLUMN "importeAnticipo" INTEGER;

ALTER TABLE "Loteo" ADD CONSTRAINT "Loteo_importeAnticipo_check"
    CHECK ("importeAnticipo" IS NULL OR "importeAnticipo" > 0);

-- El anticipo sale de una asignación, como la cuota de parcela, pero no de una tarifa.
ALTER TABLE "Cuota" DROP CONSTRAINT "Cuota_origen_coherente_check";
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_origen_coherente_check" CHECK (
    ("origen" = 'PARCELA'
        AND "asignacionId" IS NOT NULL AND "parcelaId" IS NOT NULL
        AND ("tarifaId" IS NOT NULL OR "historica")
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

-- Un solo anticipo por asignación.
CREATE UNIQUE INDEX "Cuota_asignacion_anticipo_key"
    ON "Cuota"("asignacionId")
    WHERE "origen" = 'ANTICIPO';
