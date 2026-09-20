-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('PROXIMO_VENCIMIENTO', 'CUOTA_VENCIDA');

-- CreateEnum
CREATE TYPE "ResultadoEnvio" AS ENUM ('ENVIADO', 'FALLIDO', 'SIN_EMAIL');

-- CreateTable
CREATE TABLE "ConfiguracionAvisos" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "diasAntes" INTEGER NOT NULL DEFAULT 5,
    "diasDespues" INTEGER NOT NULL DEFAULT 3,
    "horaEnvio" INTEGER NOT NULL DEFAULT 9,
    "remitenteNombre" TEXT,
    "copiaOculta" TEXT,
    "asuntoProximo" TEXT NOT NULL,
    "cuerpoProximo" TEXT NOT NULL,
    "asuntoVencida" TEXT NOT NULL,
    "cuerpoVencida" TEXT NOT NULL,
    "ultimaCorrida" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionAvisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioAviso" (
    "id" SERIAL NOT NULL,
    "socioId" INTEGER NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "fecha" DATE NOT NULL,
    "email" TEXT,
    "asunto" TEXT NOT NULL,
    "cuotaIds" INTEGER[],
    "importe" INTEGER NOT NULL,
    "resultado" "ResultadoEnvio" NOT NULL,
    "error" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "enviadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioAviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvioAviso_fecha_idx" ON "EnvioAviso"("fecha");

-- CreateIndex
CREATE INDEX "EnvioAviso_resultado_idx" ON "EnvioAviso"("resultado");

-- CreateIndex: un solo aviso por socio, tipo y día. Si el proceso corre dos veces,
-- el segundo no puede duplicar el correo.
CREATE UNIQUE INDEX "EnvioAviso_socioId_tipo_fecha_key" ON "EnvioAviso"("socioId", "tipo", "fecha");

-- AddForeignKey
ALTER TABLE "EnvioAviso" ADD CONSTRAINT "EnvioAviso_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- La configuración es una sola fila.
ALTER TABLE "ConfiguracionAvisos" ADD CONSTRAINT "ConfiguracionAvisos_fila_unica_check" CHECK ("id" = 1);
ALTER TABLE "ConfiguracionAvisos" ADD CONSTRAINT "ConfiguracionAvisos_dias_check"
    CHECK ("diasAntes" BETWEEN 0 AND 60 AND "diasDespues" BETWEEN 0 AND 180);
ALTER TABLE "ConfiguracionAvisos" ADD CONSTRAINT "ConfiguracionAvisos_hora_check"
    CHECK ("horaEnvio" BETWEEN 0 AND 23);

-- La fila de configuración la crea la API la primera vez que se la pide, con los textos
-- por defecto de @mf/shared. No se inserta acá a propósito: el motor de migraciones lee
-- el .sql con una codificación que no siempre es UTF-8, y los acentos quedaban rotos.
