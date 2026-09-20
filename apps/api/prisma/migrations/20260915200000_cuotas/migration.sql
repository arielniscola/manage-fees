-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "OrigenCuota" AS ENUM ('SOCIAL', 'PLAN');

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" SERIAL NOT NULL,
    "importe" INTEGER NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL DEFAULT 'MENSUAL',
    "diaVencimiento" INTEGER NOT NULL DEFAULT 10,
    "vigenteDesde" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuota" (
    "id" SERIAL NOT NULL,
    "asignacionId" INTEGER NOT NULL,
    "socioId" INTEGER NOT NULL,
    "parcelaId" INTEGER NOT NULL,
    "tarifaId" INTEGER NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL,
    "importe" INTEGER NOT NULL,
    "vencimiento" DATE NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "origen" "OrigenCuota" NOT NULL DEFAULT 'SOCIAL',
    "anuladaEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tarifa_vigenteDesde_key" ON "Tarifa"("vigenteDesde");

-- CreateIndex
CREATE INDEX "Cuota_socioId_estado_idx" ON "Cuota"("socioId", "estado");

-- CreateIndex
CREATE INDEX "Cuota_parcelaId_periodo_idx" ON "Cuota"("parcelaId", "periodo");

-- CreateIndex
CREATE INDEX "Cuota_estado_vencimiento_idx" ON "Cuota"("estado", "vencimiento");

-- CreateIndex
CREATE INDEX "Cuota_asignacionId_idx" ON "Cuota"("asignacionId");

-- CreateIndex
CREATE INDEX "Cuota_tarifaId_idx" ON "Cuota"("tarifaId");

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "Asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola cuota social por parcela y período: generar dos veces el mismo período no puede
-- duplicar la deuda, aunque el cron y el botón corran a la vez. Las anuladas cuentan, así
-- que anular una cuota también evita que la generación la vuelva a crear.
CREATE UNIQUE INDEX "Cuota_parcela_periodo_social_key"
    ON "Cuota"("parcelaId", "periodo")
    WHERE "origen" = 'SOCIAL';

-- Las tarifas rigen desde el primero de un mes.
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_vigenteDesde_primero_check"
    CHECK (EXTRACT(DAY FROM "vigenteDesde") = 1);

-- El día de vencimiento es un día de mes válido.
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_diaVencimiento_check"
    CHECK ("diaVencimiento" BETWEEN 1 AND 31);

-- Los importes son centavos positivos.
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_importe_positivo_check" CHECK ("importe" > 0);
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_importe_positivo_check" CHECK ("importe" > 0);

-- El período es un mes con formato AAAA-MM.
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_periodo_formato_check"
    CHECK ("periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$');
