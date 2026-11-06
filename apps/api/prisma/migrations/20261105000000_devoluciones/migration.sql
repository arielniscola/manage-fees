-- CreateEnum
CREATE TYPE "DestinoCuotasDevolucion" AS ENUM ('PENDIENTE', 'ANULADA');

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "importe" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "destinoCuotas" "DestinoCuotasDevolucion" NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datos" JSONB NOT NULL,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" INTEGER,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Devolucion_numero_key" ON "Devolucion"("numero");

-- CreateIndex
CREATE INDEX "Devolucion_cobroId_idx" ON "Devolucion"("cobroId");

-- CreateIndex
CREATE INDEX "Devolucion_fecha_idx" ON "Devolucion"("fecha");

-- CreateIndex
CREATE INDEX "Devolucion_usuarioId_idx" ON "Devolucion"("usuarioId");

-- CreateIndex
CREATE INDEX "Devolucion_anuladaPorId_idx" ON "Devolucion"("anuladaPorId");

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un cobro tiene a lo sumo una devolución vigente: las anuladas quedan como historial.
CREATE UNIQUE INDEX "Devolucion_cobro_vigente_key" ON "Devolucion"("cobroId") WHERE "anuladaEn" IS NULL;

ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_importe_positivo_check" CHECK ("importe" > 0);

-- Una devolución anulada guarda siempre cuándo y por qué.
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_anulacion_completa_check"
    CHECK (("anuladaEn" IS NULL AND "motivoAnulacion" IS NULL) OR ("anuladaEn" IS NOT NULL AND "motivoAnulacion" IS NOT NULL));

-- Contador de comprobantes de devolución, aparte del de recibos.
INSERT INTO "Contador" ("nombre", "valor") VALUES ('devolucion', 0);
