-- Adelantar cuotas: el socio puede pagar períodos que todavía no se generaron. Esas
-- cuotas se crean y se cobran en la misma transacción, así que nunca quedan impagas
-- sumando a su deuda; la marca deja constancia de que salieron de un adelanto.
ALTER TABLE "Cuota" ADD COLUMN "adelantada" BOOLEAN NOT NULL DEFAULT false;

-- Hasta cuántos meses se puede adelantar y qué descuento lleva. Una sola fila, id = 1,
-- como la configuración de avisos y la de interés.
CREATE TABLE "ConfiguracionAdelanto" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "mesesMaximos" INTEGER NOT NULL DEFAULT 12,
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "minimoMeses" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionAdelanto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ConfiguracionAdelanto" ADD CONSTRAINT "ConfiguracionAdelanto_fila_unica_check" CHECK ("id" = 1);

-- El tope duro del sistema son 36 meses; el club puede achicarlo, no agrandarlo.
ALTER TABLE "ConfiguracionAdelanto" ADD CONSTRAINT "ConfiguracionAdelanto_meses_check"
    CHECK ("mesesMaximos" BETWEEN 1 AND 36 AND "minimoMeses" BETWEEN 1 AND "mesesMaximos");

ALTER TABLE "ConfiguracionAdelanto" ADD CONSTRAINT "ConfiguracionAdelanto_descuento_check"
    CHECK ("descuento" >= 0 AND "descuento" <= 100);
