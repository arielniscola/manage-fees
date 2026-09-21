-- Historial de cuotas: lo que cada socio pagó y lo que debe de antes de que el club usara
-- el sistema. Se cargan como cuotas comunes, marcadas como históricas: las adeudadas son
-- deuda como cualquier otra y las pagadas quedan PAGADAS sin cobro ni recibo, para no
-- ensuciar la caja del club con plata que no entró por acá.
ALTER TABLE "Cuota" ADD COLUMN "historica" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cuota" ADD COLUMN "pagadaEn" DATE;

-- Una cuota histórica no sale de ninguna tarifa: el importe lo trajo la carga, porque la
-- cuota de 2023 valía lo que valía y no depende de que estén cargadas las tarifas viejas.
-- El resto de la coherencia entre orígenes queda igual que antes.
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
);

-- La fecha de pago es un dato del historial: una cuota que se cobra por el sistema deja
-- su fecha en el cobro, no acá.
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_pagada_en_check" CHECK ("pagadaEn" IS NULL OR "historica");
