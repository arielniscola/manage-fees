-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Socio" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "observaciones" TEXT,
    "fechaAlta" DATE NOT NULL,
    "fechaBaja" DATE,
    "motivoBaja" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcela" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "sector" TEXT,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignacion" (
    "id" SERIAL NOT NULL,
    "socioId" INTEGER NOT NULL,
    "parcelaId" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Socio_numero_key" ON "Socio"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Socio_dni_key" ON "Socio"("dni");

-- CreateIndex
CREATE INDEX "Socio_apellido_nombre_idx" ON "Socio"("apellido", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_codigo_key" ON "Parcela"("codigo");

-- CreateIndex
CREATE INDEX "Asignacion_socioId_idx" ON "Asignacion"("socioId");

-- CreateIndex
CREATE INDEX "Asignacion_parcelaId_idx" ON "Asignacion"("parcelaId");

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola asignación vigente por parcela (Prisma no soporta índices parciales en el schema).
CREATE UNIQUE INDEX "Asignacion_parcela_vigente_key" ON "Asignacion"("parcelaId") WHERE "hasta" IS NULL;

-- Una asignación no puede terminar antes de empezar.
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_hasta_posterior_check" CHECK ("hasta" IS NULL OR "hasta" >= "desde");
