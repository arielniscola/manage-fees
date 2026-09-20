-- Interés por mora: un porcentaje sobre las cuotas impagas que se aplica el día
-- configurado de cada mes. No genera filas de cuota; el recargo se calcula al vuelo y
-- queda congelado en el detalle del cobro cuando el socio paga.
CREATE TABLE "ConfiguracionInteres" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "diaAplicacion" INTEGER NOT NULL DEFAULT 10,
    "porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionInteres_pkey" PRIMARY KEY ("id")
);

-- La fila es única: id siempre 1, como en la configuración de avisos.
ALTER TABLE "ConfiguracionInteres" ADD CONSTRAINT "ConfiguracionInteres_fila_unica_check" CHECK ("id" = 1);

ALTER TABLE "ConfiguracionInteres" ADD CONSTRAINT "ConfiguracionInteres_dia_check"
    CHECK ("diaAplicacion" BETWEEN 1 AND 31);

ALTER TABLE "ConfiguracionInteres" ADD CONSTRAINT "ConfiguracionInteres_porcentaje_check"
    CHECK ("porcentaje" >= 0 AND "porcentaje" <= 100);
