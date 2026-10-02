-- Va en una migración aparte: Postgres no deja usar un valor de enum en la misma
-- transacción en que se agrega, y la siguiente migración lo usa en sus restricciones.
ALTER TYPE "OrigenCuota" ADD VALUE 'ANTICIPO';
