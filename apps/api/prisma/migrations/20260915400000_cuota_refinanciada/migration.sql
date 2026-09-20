-- Va en su propia migración: Postgres no deja usar un valor de enum recién agregado
-- dentro de la misma transacción que lo agrega.
ALTER TYPE "EstadoCuota" ADD VALUE 'REFINANCIADA';
