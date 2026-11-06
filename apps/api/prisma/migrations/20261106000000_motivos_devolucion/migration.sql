-- Motivos de devolución parametrizables. Las devoluciones ya cargadas conservan su texto libre
-- y quedan sin motivo de la lista.
CREATE TABLE "MotivoDevolucion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivoDevolucion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MotivoDevolucion_nombre_key" ON "MotivoDevolucion"("nombre");

ALTER TABLE "Devolucion" ADD COLUMN "motivoDevolucionId" INTEGER;

CREATE INDEX "Devolucion_motivoDevolucionId_idx" ON "Devolucion"("motivoDevolucionId");

ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_motivoDevolucionId_fkey" FOREIGN KEY ("motivoDevolucionId") REFERENCES "MotivoDevolucion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
