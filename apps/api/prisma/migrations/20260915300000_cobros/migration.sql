-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'OTRO');

-- CreateTable
CREATE TABLE "Cobro" (
    "id" SERIAL NOT NULL,
    "socioId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "total" INTEGER NOT NULL,
    "observaciones" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" INTEGER,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CobroDetalle" (
    "id" SERIAL NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "cuotaId" INTEGER NOT NULL,
    "importe" INTEGER NOT NULL,

    CONSTRAINT "CobroDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datos" JSONB NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contador" (
    "nombre" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Contador_pkey" PRIMARY KEY ("nombre")
);

-- CreateIndex
CREATE INDEX "Cobro_socioId_fecha_idx" ON "Cobro"("socioId", "fecha");

-- CreateIndex
CREATE INDEX "Cobro_fecha_idx" ON "Cobro"("fecha");

-- CreateIndex
CREATE INDEX "Cobro_usuarioId_idx" ON "Cobro"("usuarioId");

-- CreateIndex
CREATE INDEX "Cobro_anuladoPorId_idx" ON "Cobro"("anuladoPorId");

-- CreateIndex
CREATE INDEX "CobroDetalle_cuotaId_idx" ON "CobroDetalle"("cuotaId");

-- CreateIndex
CREATE UNIQUE INDEX "CobroDetalle_cobroId_cuotaId_key" ON "CobroDetalle"("cobroId", "cuotaId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_numero_key" ON "Recibo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_cobroId_key" ON "Recibo"("cobroId");

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroDetalle" ADD CONSTRAINT "CobroDetalle_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroDetalle" ADD CONSTRAINT "CobroDetalle_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los importes son centavos positivos.
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_total_positivo_check" CHECK ("total" > 0);
ALTER TABLE "CobroDetalle" ADD CONSTRAINT "CobroDetalle_importe_positivo_check" CHECK ("importe" > 0);

-- Un cobro anulado guarda siempre cuándo y por qué.
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_anulacion_completa_check"
    CHECK (("anuladoEn" IS NULL AND "motivoAnulacion" IS NULL) OR ("anuladoEn" IS NOT NULL AND "motivoAnulacion" IS NOT NULL));

-- Contador de recibos. Se incrementa dentro de la transacción que emite el comprobante,
-- así un error hace retroceder el número y la numeración no queda salteada.
INSERT INTO "Contador" ("nombre", "valor") VALUES ('recibo', 0);
