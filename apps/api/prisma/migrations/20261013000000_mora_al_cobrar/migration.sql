-- La mora deja de calcularse sola: pasa a ser un concepto que se suma, o no, al cobrar o
-- refinanciar una cuota vencida. De la configuración queda solo el porcentaje que se
-- propone; el día de aplicación y el modo ya no tienen sentido.
ALTER TABLE "ConfiguracionInteres" DROP CONSTRAINT "ConfiguracionInteres_dia_check";
ALTER TABLE "ConfiguracionInteres" DROP COLUMN "diaAplicacion";
ALTER TABLE "ConfiguracionInteres" DROP COLUMN "modo";
DROP TYPE "ModoInteres";

-- Cuánto de lo cobrado por cada cuota fue mora, para poder mostrarlo aparte.
ALTER TABLE "CobroDetalle" ADD COLUMN "mora" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CobroDetalle" ADD CONSTRAINT "CobroDetalle_mora_check" CHECK ("mora" >= 0 AND "mora" <= "importe");
