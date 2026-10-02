-- Elimina las cuotas con estado ANULADA.
--
-- Las anuladas que figuran en un cobro (CobroDetalle) o en un plan de pago
-- (PlanDeudaOrigen) no se borran: las claves foráneas no lo permiten y son
-- parte del historial de esos movimientos.
--
-- Correr primero el paso 1 para ver qué se va a borrar.

-- 1) Vista previa: cuántas se borran y cuántas se conservan, por origen.
SELECT
  c."origen",
  COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "CobroDetalle" d WHERE d."cuotaId" = c."id")
                     AND NOT EXISTS (SELECT 1 FROM "PlanDeudaOrigen" p WHERE p."cuotaId" = c."id")) AS a_borrar,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CobroDetalle" d WHERE d."cuotaId" = c."id")
                      OR EXISTS (SELECT 1 FROM "PlanDeudaOrigen" p WHERE p."cuotaId" = c."id")) AS se_conservan
FROM "Cuota" c
WHERE c."estado" = 'ANULADA'
GROUP BY c."origen";

-- 2) Borrado, dentro de una transacción.
BEGIN;

DELETE FROM "Cuota" c
WHERE c."estado" = 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM "CobroDetalle" d WHERE d."cuotaId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "PlanDeudaOrigen" p WHERE p."cuotaId" = c."id");

-- Revisar el "DELETE n" que devuelve y cerrar con COMMIT (o ROLLBACK para deshacer).
COMMIT;
