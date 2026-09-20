-- El socio con parcela pasa a pagar dos cuotas por período: la cuota social, por ser socio,
-- y una cuota por cada parcela que tiene, que es el pago por la propiedad del terreno. El
-- suplente, que no tiene parcela, no genera ninguna de las dos.
--
-- Lo que hasta hoy se llamaba «cuota social» era en realidad la cuota de la parcela: se
-- generaba por parcela y período. Se renombra a PARCELA y se suma el origen SOCIO.

-- Cada alcance lleva su propio historial de tarifas: importe, periodicidad y día de
-- vencimiento propios. Las tarifas que ya existen valorizan la parcela.
CREATE TYPE "AlcanceTarifa" AS ENUM ('SOCIO', 'PARCELA');

ALTER TABLE "Tarifa" ADD COLUMN "alcance" "AlcanceTarifa" NOT NULL DEFAULT 'PARCELA';

-- El mes de vigencia deja de ser único en toda la tabla y pasa a serlo dentro del alcance:
-- la cuota social y la de parcela pueden cambiar de valor el mismo mes.
DROP INDEX "Tarifa_vigenteDesde_key";
CREATE UNIQUE INDEX "Tarifa_alcance_vigenteDesde_key" ON "Tarifa"("alcance", "vigenteDesde");

-- El enum de origen se reemplaza entero: en Postgres no se puede renombrar un valor y
-- agregar otro dentro de la misma transacción sin dejar de poder usarlos acá.
ALTER TABLE "Cuota" DROP CONSTRAINT "Cuota_origen_coherente_check";
DROP INDEX "Cuota_parcela_periodo_social_key";
DROP INDEX "Cuota_plan_numero_key";

CREATE TYPE "OrigenCuota_nuevo" AS ENUM ('PARCELA', 'SOCIO', 'PLAN');
ALTER TABLE "Cuota" ALTER COLUMN "origen" DROP DEFAULT;
ALTER TABLE "Cuota"
    ALTER COLUMN "origen" TYPE "OrigenCuota_nuevo"
    USING (CASE WHEN "origen"::text = 'SOCIAL' THEN 'PARCELA' ELSE "origen"::text END)::"OrigenCuota_nuevo";
DROP TYPE "OrigenCuota";
ALTER TYPE "OrigenCuota_nuevo" RENAME TO "OrigenCuota";
ALTER TABLE "Cuota" ALTER COLUMN "origen" SET DEFAULT 'PARCELA';

-- Una sola cuota de parcela por parcela y período, y una sola cuota social por socio y
-- período: generar dos veces el mismo período no puede duplicar la deuda. Las anuladas
-- cuentan, así que anular una cuota también evita que la generación la vuelva a crear.
CREATE UNIQUE INDEX "Cuota_parcela_periodo_key"
    ON "Cuota"("parcelaId", "periodo")
    WHERE "origen" = 'PARCELA';

CREATE UNIQUE INDEX "Cuota_socio_periodo_social_key"
    ON "Cuota"("socioId", "periodo")
    WHERE "origen" = 'SOCIO';

CREATE UNIQUE INDEX "Cuota_plan_numero_key" ON "Cuota"("planId", "numeroEnPlan") WHERE "origen" = 'PLAN';

-- Una cuota de parcela sale siempre de una asignación; la social, de un socio y una tarifa,
-- sin parcela; una de plan, siempre de un plan. Los tres orígenes se excluyen.
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_origen_coherente_check" CHECK (
    ("origen" = 'PARCELA'
        AND "asignacionId" IS NOT NULL AND "parcelaId" IS NOT NULL AND "tarifaId" IS NOT NULL
        AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
    OR
    ("origen" = 'SOCIO'
        AND "tarifaId" IS NOT NULL
        AND "asignacionId" IS NULL AND "parcelaId" IS NULL AND "planId" IS NULL AND "numeroEnPlan" IS NULL)
    OR
    ("origen" = 'PLAN'
        AND "planId" IS NOT NULL AND "numeroEnPlan" IS NOT NULL
        AND "asignacionId" IS NULL AND "parcelaId" IS NULL AND "tarifaId" IS NULL)
);
