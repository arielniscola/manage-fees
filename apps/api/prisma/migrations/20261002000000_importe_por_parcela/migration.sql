-- En algunos loteos cada parcela paga su propio importe (por ejemplo, según su tamaño o
-- ubicación) en lugar del de la tarifa. La tarifa sigue definiendo la periodicidad, el día
-- de vencimiento y desde cuándo se cobra; solo el importe sale de la parcela.
ALTER TABLE "Loteo" ADD COLUMN "importePorParcela" BOOLEAN NOT NULL DEFAULT false;

-- Centavos. Null mientras no se cargue: la parcela paga el importe de la tarifa.
ALTER TABLE "Parcela" ADD COLUMN "importeCuota" INTEGER;

ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_importeCuota_check"
    CHECK ("importeCuota" IS NULL OR "importeCuota" > 0);
