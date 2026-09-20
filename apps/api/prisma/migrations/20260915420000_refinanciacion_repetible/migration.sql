-- Si un plan se cancela, sus cuotas vuelven a pendiente y tienen que poder entrar en un
-- plan nuevo. Con cuotaId único a nivel global eso era imposible, y el registro del plan
-- viejo se perdía. La unicidad pasa a ser por plan; que una cuota no esté en dos planes
-- vivos a la vez lo garantiza su estado REFINANCIADA.
DROP INDEX "PlanDeudaOrigen_cuotaId_key";

CREATE UNIQUE INDEX "PlanDeudaOrigen_planId_cuotaId_key" ON "PlanDeudaOrigen"("planId", "cuotaId");

CREATE INDEX "PlanDeudaOrigen_cuotaId_idx" ON "PlanDeudaOrigen"("cuotaId");
