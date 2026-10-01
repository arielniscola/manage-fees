import { Prisma } from '@prisma/client';

/**
 * Filtros del loteo activo que se elige en el sidebar. Socio no cuelga de Loteo: la
 * relación es Socio > Asignación > Parcela > Sector > Loteo, así que «pertenecer a un
 * loteo» es tener una asignación vigente en alguna de sus parcelas. El criterio es
 * estricto: un socio sin parcela en el loteo (un suplente, uno dado de baja) no aparece.
 *
 * Los fragmentos usan `AND` para poder combinarse con el `OR` de la búsqueda por texto,
 * y devuelven `{}` cuando no hay loteo activo, para spreadearlos sin condicionales.
 */

export const sociosDelLoteo = (loteoId?: number): Prisma.SocioWhereInput =>
  loteoId ? { AND: [{ asignaciones: { some: { hasta: null, parcela: { sector: { loteoId } } } } }] } : {};

export const parcelasDelLoteo = (loteoId?: number): Prisma.ParcelaWhereInput =>
  loteoId ? { AND: [{ sector: { loteoId } }] } : {};

/**
 * Una cuota sigue a la parcela que la originó. Las de un plan de pago no tienen parcela:
 * esas siguen al socio, para que la deuda refinanciada no se pierda de vista.
 */
export const cuotasDelLoteo = (loteoId?: number): Prisma.CuotaWhereInput =>
  loteoId
    ? {
        AND: [
          {
            OR: [
              { parcela: { sector: { loteoId } } },
              { parcelaId: null, socio: sociosDelLoteo(loteoId) },
            ],
          },
        ],
      }
    : {};

/**
 * Un cobro es del loteo si alguno de sus renglones cancela una cuota del loteo: el mismo
 * criterio del filtro por parcela. Así un socio con parcelas en dos loteos no arrastra al
 * listado de uno lo que pagó por el otro, y cobros y cuotas cuentan lo mismo.
 */
export const cobrosDelLoteo = (loteoId?: number): Prisma.CobroWhereInput =>
  loteoId ? { AND: [{ detalles: { some: { cuota: cuotasDelLoteo(loteoId) } } }] } : {};

export const planesDelLoteo = (loteoId?: number): Prisma.PlanPagoWhereInput =>
  loteoId ? { AND: [{ socio: sociosDelLoteo(loteoId) }] } : {};

/** El mismo criterio de `sociosDelLoteo`, en SQL, para las consultas crudas del panel. */
export const sqlSocioDelLoteo = (columnaSocioId: Prisma.Sql, loteoId?: number): Prisma.Sql =>
  loteoId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Asignacion" a
        JOIN "Parcela" p ON p."id" = a."parcelaId"
        JOIN "Sector" s ON s."id" = p."sectorId"
        WHERE a."socioId" = ${columnaSocioId} AND a."hasta" IS NULL AND s."loteoId" = ${loteoId}
      )`
    : Prisma.empty;

/** El mismo criterio de `cuotasDelLoteo`, en SQL. `cuota` es el alias de la tabla Cuota. */
export const sqlCuotaDelLoteo = (cuota: Prisma.Sql, loteoId?: number): Prisma.Sql =>
  loteoId
    ? Prisma.sql`AND (
        EXISTS (
          SELECT 1 FROM "Parcela" p
          JOIN "Sector" s ON s."id" = p."sectorId"
          WHERE p."id" = ${cuota}."parcelaId" AND s."loteoId" = ${loteoId}
        )
        OR (${cuota}."parcelaId" IS NULL ${sqlSocioDelLoteo(Prisma.sql`${cuota}."socioId"`, loteoId)})
      )`
    : Prisma.empty;

/** El mismo criterio de `cobrosDelLoteo`, en SQL. `cobro` es el alias de la tabla Cobro. */
export const sqlCobroDelLoteo = (cobro: Prisma.Sql, loteoId?: number): Prisma.Sql =>
  loteoId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "CobroDetalle" d
        JOIN "Cuota" dc ON dc."id" = d."cuotaId"
        WHERE d."cobroId" = ${cobro}."id" ${sqlCuotaDelLoteo(Prisma.sql`dc`, loteoId)}
      )`
    : Prisma.empty;
