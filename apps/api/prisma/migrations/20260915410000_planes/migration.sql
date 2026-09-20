-- Las cuotas de un plan de pago no cuelgan de una parcela ni de una tarifa.
ALTER TABLE "Cuota" ALTER COLUMN "asignacionId" DROP NOT NULL;
ALTER TABLE "Cuota" ALTER COLUMN "parcelaId" DROP NOT NULL;
ALTER TABLE "Cuota" ALTER COLUMN "tarifaId" DROP NOT NULL;
ALTER TABLE "Cuota" ADD COLUMN "planId" INTEGER;
ALTER TABLE "Cuota" ADD COLUMN "numeroEnPlan" INTEGER;

-- CreateTable
CREATE TABLE "PlanPago" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "socioId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "deudaTotal" INTEGER NOT NULL,
    "anticipo" INTEGER NOT NULL DEFAULT 0,
    "cantidadCuotas" INTEGER NOT NULL,
    "toleranciaVencidas" INTEGER NOT NULL DEFAULT 2,
    "observaciones" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "canceladoEn" TIMESTAMP(3),
    "canceladoPorId" INTEGER,
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDeudaOrigen" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "cuotaId" INTEGER NOT NULL,
    "importe" INTEGER NOT NULL,

    CONSTRAINT "PlanDeudaOrigen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPago_numero_key" ON "PlanPago"("numero");

-- CreateIndex
CREATE INDEX "PlanPago_socioId_fecha_idx" ON "PlanPago"("socioId", "fecha");

-- CreateIndex
CREATE INDEX "PlanPago_usuarioId_idx" ON "PlanPago"("usuarioId");

-- CreateIndex
CREATE INDEX "PlanPago_canceladoPorId_idx" ON "PlanPago"("canceladoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDeudaOrigen_cuotaId_key" ON "PlanDeudaOrigen"("cuotaId");

-- CreateIndex
CREATE INDEX "PlanDeudaOrigen_planId_idx" ON "PlanDeudaOrigen"("planId");

-- CreateIndex
CREATE INDEX "Cuota_planId_idx" ON "Cuota"("planId");

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDeudaOrigen" ADD CONSTRAINT "PlanDeudaOrigen_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanPago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDeudaOrigen" ADD CONSTRAINT "PlanDeudaOrigen_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una cuota social sale siempre de una parcela; una de plan, siempre de un plan.
-- Los dos orígenes se excluyen: ninguna cuota puede ser las dos cosas.
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_origen_coherente_check" CHECK (
    ("origen" = 'SOCIAL'
        AND "asignacionId" IS NOT NULL AND "parcelaId" IS NOT NULL AND "tarifaId" IS NOT NULL
        AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
    OR
    ("origen" = 'PLAN'
        AND "planId" IS NOT NULL AND "numeroEnPlan" IS NOT NULL
        AND "asignacionId" IS NULL AND "parcelaId" IS NULL AND "tarifaId" IS NULL)
);

-- El anticipo es el número 0; las cuotas financiadas van de 1 en adelante.
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_numeroEnPlan_check" CHECK ("numeroEnPlan" IS NULL OR "numeroEnPlan" >= 0);

-- Una cuota del plan no puede repetir número dentro del mismo plan.
CREATE UNIQUE INDEX "Cuota_plan_numero_key" ON "Cuota"("planId", "numeroEnPlan") WHERE "origen" = 'PLAN';

-- Los importes son centavos, y el anticipo nunca supera la deuda que se refinancia.
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_deuda_positiva_check" CHECK ("deudaTotal" > 0);
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_anticipo_check" CHECK ("anticipo" >= 0 AND "anticipo" <= "deudaTotal");
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_cantidadCuotas_check" CHECK ("cantidadCuotas" BETWEEN 1 AND 60);
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_tolerancia_check" CHECK ("toleranciaVencidas" BETWEEN 1 AND 12);
ALTER TABLE "PlanDeudaOrigen" ADD CONSTRAINT "PlanDeudaOrigen_importe_positivo_check" CHECK ("importe" > 0);

-- Un plan cancelado guarda siempre cuándo y por qué.
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_cancelacion_completa_check"
    CHECK (("canceladoEn" IS NULL AND "motivoCancelacion" IS NULL) OR ("canceladoEn" IS NOT NULL AND "motivoCancelacion" IS NOT NULL));

-- Numeración correlativa de planes, con el mismo mecanismo que los recibos.
INSERT INTO "Contador" ("nombre", "valor") VALUES ('plan', 0);
