-- Los socios pasan a tener tipo: titular (tiene o tuvo parcelas) o suplente (en lista de
-- espera). Y el cambio de titular de una parcela se registra como una transferencia.

-- CreateEnum
CREATE TYPE "TipoSocio" AS ENUM ('TITULAR', 'SUPLENTE');

-- AlterTable
ALTER TABLE "Socio" ADD COLUMN "tipo" "TipoSocio" NOT NULL DEFAULT 'TITULAR';

-- Los socios que ya existen y nunca tuvieron una parcela quedan como suplentes: es lo
-- que son en los hechos, y así aparecen en el selector de transferencias.
UPDATE "Socio" s
SET "tipo" = 'SUPLENTE'
WHERE NOT EXISTS (SELECT 1 FROM "Asignacion" a WHERE a."socioId" = s."id");

-- CreateIndex
CREATE INDEX "Socio_tipo_idx" ON "Socio"("tipo");

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" SERIAL NOT NULL,
    "parcelaId" INTEGER NOT NULL,
    "deSocioId" INTEGER NOT NULL,
    "aSocioId" INTEGER NOT NULL,
    "asignacionAnteriorId" INTEGER NOT NULL,
    "asignacionNuevaId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transferencia_asignacionAnteriorId_key" ON "Transferencia"("asignacionAnteriorId");

-- CreateIndex
CREATE UNIQUE INDEX "Transferencia_asignacionNuevaId_key" ON "Transferencia"("asignacionNuevaId");

-- CreateIndex
CREATE INDEX "Transferencia_parcelaId_fecha_idx" ON "Transferencia"("parcelaId", "fecha");

-- CreateIndex
CREATE INDEX "Transferencia_deSocioId_idx" ON "Transferencia"("deSocioId");

-- CreateIndex
CREATE INDEX "Transferencia_aSocioId_idx" ON "Transferencia"("aSocioId");

-- CreateIndex
CREATE INDEX "Transferencia_usuarioId_idx" ON "Transferencia"("usuarioId");

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_deSocioId_fkey" FOREIGN KEY ("deSocioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_aSocioId_fkey" FOREIGN KEY ("aSocioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_asignacionAnteriorId_fkey" FOREIGN KEY ("asignacionAnteriorId") REFERENCES "Asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_asignacionNuevaId_fkey" FOREIGN KEY ("asignacionNuevaId") REFERENCES "Asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una parcela no se transfiere a sí misma: el que cede y el que recibe son distintos.
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_socios_distintos_check"
    CHECK ("deSocioId" <> "aSocioId");

-- Las dos puntas de la transferencia son titularidades distintas.
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_asignaciones_distintas_check"
    CHECK ("asignacionAnteriorId" <> "asignacionNuevaId");
