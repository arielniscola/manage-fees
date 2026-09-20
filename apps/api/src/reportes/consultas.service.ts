import { Injectable } from '@nestjs/common';
import {
  ETIQUETA_ESTADO_PLAN,
  type TipoReporte,
  ETIQUETA_MEDIO_PAGO,
  etiquetaPeriodo,
  hoy,
  interesDeCuota,
  numeroDeParcela,
  numeroPlan,
  numeroRecibo,
  type CobroListItem,
  type PlanListItem,
  type SocioListItem,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { CobrosService } from '../cobros/cobros.service';
import { aFecha, deFecha } from '../common/fechas';
import { cuotasDelLoteo, parcelasDelLoteo, sociosDelLoteo, sqlSocioDelLoteo } from '../common/loteo';
import { InteresService } from '../configuracion/interes.service';
import { PlanesService } from '../planes/planes.service';
import { PrismaService } from '../prisma/prisma.module';
import { SociosService } from '../socios/socios.service';

/** Tope defensivo: un club de este tamaño no llega ni cerca, y evita traer la base entera. */
const TODOS = 100_000;

export interface Rango {
  desde?: string;
  hasta?: string;
  /** Loteo activo del sidebar: acota el reporte a los socios y parcelas de ese loteo. */
  loteoId?: number;
}

/**
 * Las filas de cada reporte. El panel saca sus totales de estas mismas consultas, así que
 * lo que se ve en pantalla y lo que se exporta no pueden diferir.
 */
@Injectable()
export class ConsultasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socios: SociosService,
    private readonly cobros: CobrosService,
    private readonly planes: PlanesService,
    private readonly interes: InteresService,
  ) {}

  /** Cobros del rango, anulados incluidos y marcados como tales. */
  async cobrosDelRango(rango: Rango): Promise<{ filas: CobroListItem[]; total: number; cantidad: number }> {
    const { items, resumen } = await this.cobros.listar({
      desde: rango.desde,
      hasta: rango.hasta,
      loteoId: rango.loteoId,
      estado: 'todos',
      page: 1,
      pageSize: TODOS,
    });
    // El resumen del listado ya deja afuera los anulados: es el mismo número del panel.
    return { filas: items, total: resumen.total, cantidad: resumen.cobros };
  }

  async padron(loteoId?: number): Promise<SocioListItem[]> {
    const { items } = await this.socios.listar({ estado: 'todos', loteoId, page: 1, pageSize: TODOS });
    return items;
  }

  /** Socios activos con cuotas vencidas, del que más debe al que menos. */
  async morosos(loteoId?: number): Promise<SocioListItem[]> {
    const { items } = await this.socios.listar({ estado: 'moroso', loteoId, page: 1, pageSize: TODOS });
    return items;
  }

  async planesDelRango(rango: Rango): Promise<PlanListItem[]> {
    const { items } = await this.planes.listar({ estado: 'todos', loteoId: rango.loteoId, page: 1, pageSize: TODOS });
    if (!rango.desde && !rango.hasta) return items;
    return items.filter((p) => (!rango.desde || p.fecha >= rango.desde) && (!rango.hasta || p.fecha <= rango.hasta));
  }

  // ---------------------------------------------------------------- Agregados del panel

  /**
   * Deuda impaga al día de hoy. No depende del rango: una cuota impaga no tiene corte.
   * Se recorren las filas en lugar de agregarlas en SQL porque el interés por mora se
   * calcula al vuelo por cuota, con la misma función que usa el resto de la aplicación.
   */
  async deuda(loteoId?: number): Promise<{ total: number; vencida: number; cuotas: number; cuotasVencidas: number }> {
    const hoyISO = hoy();
    const corte = aFecha(hoyISO);
    const [config, pendientes] = await Promise.all([
      this.interes.vigente(),
      this.prisma.cuota.findMany({
        where: { estado: 'PENDIENTE', ...cuotasDelLoteo(loteoId) },
        select: { importe: true, vencimiento: true, estado: true, origen: true },
      }),
    ]);

    const deuda = { total: 0, vencida: 0, cuotas: 0, cuotasVencidas: 0 };
    for (const c of pendientes) {
      const conInteres = c.importe + interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO);
      deuda.total += conInteres;
      deuda.cuotas += 1;
      if (c.vencimiento < corte) {
        deuda.vencida += conInteres;
        deuda.cuotasVencidas += 1;
      }
    }
    return deuda;
  }

  async conteos(loteoId?: number): Promise<{ sociosActivos: number; parcelasAsignadas: number; parcelasTotales: number }> {
    const delLoteo = parcelasDelLoteo(loteoId);
    const [sociosActivos, parcelasAsignadas, parcelasTotales] = await Promise.all([
      this.prisma.socio.count({ where: { fechaBaja: null, ...sociosDelLoteo(loteoId) } }),
      this.prisma.parcela.count({ where: { asignaciones: { some: { hasta: null } }, ...delLoteo } }),
      this.prisma.parcela.count({ where: delLoteo }),
    ]);
    return { sociosActivos, parcelasAsignadas, parcelasTotales };
  }

  /**
   * Cobrado y emitido mes a mes. Se agrega en SQL porque Prisma no sabe agrupar por mes.
   * «Emitido» deja afuera las anuladas y las refinanciadas: estas últimas ya se cuentan
   * en las cuotas del plan que las reemplazó.
   */
  async evolucion(desdeMes: string, loteoId?: number): Promise<Map<string, { emitido: number; cobrado: number }>> {
    const desde = aFecha(`${desdeMes}-01`);

    const cobrado = await this.prisma.$queryRaw<{ mes: string; monto: bigint }[]>`
      SELECT to_char(c."fecha", 'YYYY-MM') AS mes, COALESCE(SUM(c."total"), 0)::bigint AS monto
      FROM "Cobro" c
      WHERE c."anuladoEn" IS NULL AND c."fecha" >= ${desde}
      ${sqlSocioDelLoteo(Prisma.sql`c."socioId"`, loteoId)}
      GROUP BY 1
    `;
    // Una cuota de plan no tiene parcela: esa sigue al socio, igual que en `cuotasDelLoteo`.
    const porLoteo = loteoId
      ? Prisma.sql`AND (
          EXISTS (
            SELECT 1 FROM "Parcela" p
            JOIN "Sector" s ON s."id" = p."sectorId"
            WHERE p."id" = cu."parcelaId" AND s."loteoId" = ${loteoId}
          )
          OR (cu."parcelaId" IS NULL ${sqlSocioDelLoteo(Prisma.sql`cu."socioId"`, loteoId)})
        )`
      : Prisma.empty;
    const emitido = await this.prisma.$queryRaw<{ mes: string; monto: bigint }[]>`
      SELECT to_char(cu."vencimiento", 'YYYY-MM') AS mes, COALESCE(SUM(cu."importe"), 0)::bigint AS monto
      FROM "Cuota" cu
      WHERE cu."estado" IN ('PENDIENTE', 'PAGADA') AND cu."vencimiento" >= ${desde}
      ${porLoteo}
      GROUP BY 1
    `;

    const meses = new Map<string, { emitido: number; cobrado: number }>();
    const acumular = (filas: { mes: string; monto: bigint }[], campo: 'emitido' | 'cobrado') => {
      for (const f of filas) {
        const actual = meses.get(f.mes) ?? { emitido: 0, cobrado: 0 };
        actual[campo] = Number(f.monto);
        meses.set(f.mes, actual);
      }
    };
    acumular(emitido, 'emitido');
    acumular(cobrado, 'cobrado');
    return meses;
  }

  async planesVigentes(loteoId?: number): Promise<number> {
    const { items } = await this.planes.listar({ estado: 'vigente', loteoId, page: 1, pageSize: TODOS });
    return items.length;
  }

  /** Nombre del loteo activo, para dejarlo escrito en el título del reporte. */
  async nombreDeLoteo(loteoId?: number): Promise<string | null> {
    if (!loteoId) return null;
    const loteo = await this.prisma.loteo.findUnique({ where: { id: loteoId }, select: { nombre: true } });
    return loteo?.nombre ?? null;
  }
}

// ---------------------------------------------------------------- Filas para exportar

export interface Columna<T> {
  titulo: string;
  ancho: number;
  valor: (fila: T) => string | number;
  /** Los importes se exportan como número, con formato de moneda en el Excel. */
  moneda?: boolean;
}

/**
 * Qué filas suman en el total del reporte. Por defecto todas; los cobros anulados quedan
 * afuera, para que el total del archivo sea el mismo número que muestra el panel.
 */
export const CUENTA_EN_TOTAL: Partial<Record<TipoReporte, (fila: never) => boolean>> = {
  cobros: ((c: CobroListItem) => !c.anulado) as (fila: never) => boolean,
};

/**
 * La manzana y el número de cada parcela del socio, en columnas separadas para poder
 * filtrar y ordenar en el Excel. Con varias parcelas van en el mismo orden en las dos
 * columnas, así la primera manzana corresponde al primer número.
 */
const COLUMNAS_DE_PARCELA: Columna<SocioListItem>[] = [
  { titulo: 'Sector/Manzana', ancho: 15, valor: (s) => s.parcelas.map((p) => p.manzana ?? '—').join(', ') },
  { titulo: 'N° parcela', ancho: 11, valor: (s) => s.parcelas.map(numeroDeParcela).join(', ') },
];

export const COLUMNAS_SOCIOS: Columna<SocioListItem>[] = [
  { titulo: 'N° socio', ancho: 10, valor: (s) => s.numero },
  { titulo: 'Apellido', ancho: 18, valor: (s) => s.apellido },
  { titulo: 'Nombre', ancho: 18, valor: (s) => s.nombre },
  { titulo: 'DNI', ancho: 12, valor: (s) => s.dni },
  { titulo: 'Email', ancho: 28, valor: (s) => s.email ?? '' },
  { titulo: 'Teléfono', ancho: 16, valor: (s) => s.telefono ?? '' },
  { titulo: 'Alta', ancho: 12, valor: (s) => s.fechaAlta },
  { titulo: 'Baja', ancho: 12, valor: (s) => s.fechaBaja ?? '' },
  { titulo: 'Estado', ancho: 10, valor: (s) => (s.estado === 'activo' ? 'Activo' : 'Baja') },
  { titulo: 'Parcelas', ancho: 24, valor: (s) => s.parcelas.map((p) => p.etiqueta).join(', ') },
  ...COLUMNAS_DE_PARCELA,
  { titulo: 'Cuotas pendientes', ancho: 16, valor: (s) => s.estadoCuenta.pendientes },
  { titulo: 'Cuotas vencidas', ancho: 16, valor: (s) => s.estadoCuenta.vencidas },
  { titulo: 'Deuda', ancho: 14, valor: (s) => s.estadoCuenta.deuda, moneda: true },
];

export const COLUMNAS_COBROS: Columna<CobroListItem>[] = [
  { titulo: 'Recibo', ancho: 12, valor: (c) => numeroRecibo(c.numeroRecibo) },
  { titulo: 'Fecha', ancho: 12, valor: (c) => c.fecha },
  { titulo: 'N° socio', ancho: 10, valor: (c) => c.socio.numero },
  { titulo: 'Socio', ancho: 26, valor: (c) => `${c.socio.apellido}, ${c.socio.nombre}` },
  { titulo: 'Medio', ancho: 15, valor: (c) => ETIQUETA_MEDIO_PAGO[c.medio] },
  { titulo: 'Cuotas', ancho: 9, valor: (c) => c.cantidadCuotas },
  { titulo: 'Total', ancho: 14, valor: (c) => c.total, moneda: true },
  { titulo: 'Estado', ancho: 11, valor: (c) => (c.anulado ? 'Anulado' : 'Vigente') },
  { titulo: 'Registró', ancho: 18, valor: (c) => c.registradoPor },
  { titulo: 'Motivo de anulación', ancho: 30, valor: (c) => c.motivoAnulacion ?? '' },
];

export const COLUMNAS_MOROSOS: Columna<SocioListItem>[] = [
  { titulo: 'N° socio', ancho: 10, valor: (s) => s.numero },
  { titulo: 'Apellido', ancho: 18, valor: (s) => s.apellido },
  { titulo: 'Nombre', ancho: 18, valor: (s) => s.nombre },
  { titulo: 'DNI', ancho: 12, valor: (s) => s.dni },
  { titulo: 'Email', ancho: 28, valor: (s) => s.email ?? '' },
  { titulo: 'Teléfono', ancho: 16, valor: (s) => s.telefono ?? '' },
  { titulo: 'Parcelas', ancho: 24, valor: (s) => s.parcelas.map((p) => p.etiqueta).join(', ') },
  ...COLUMNAS_DE_PARCELA,
  { titulo: 'Cuotas vencidas', ancho: 16, valor: (s) => s.estadoCuenta.vencidas },
  { titulo: 'Deuda vencida', ancho: 15, valor: (s) => s.estadoCuenta.deudaVencida, moneda: true },
  { titulo: 'Deuda total', ancho: 15, valor: (s) => s.estadoCuenta.deuda, moneda: true },
];

export const COLUMNAS_PLANES: Columna<PlanListItem>[] = [
  { titulo: 'Plan', ancho: 10, valor: (p) => numeroPlan(p.numero) },
  { titulo: 'Firmado', ancho: 12, valor: (p) => p.fecha },
  { titulo: 'N° socio', ancho: 10, valor: (p) => p.socio.numero },
  { titulo: 'Socio', ancho: 26, valor: (p) => `${p.socio.apellido}, ${p.socio.nombre}` },
  { titulo: 'Deuda refinanciada', ancho: 18, valor: (p) => p.deudaTotal, moneda: true },
  { titulo: 'Anticipo', ancho: 14, valor: (p) => p.anticipo, moneda: true },
  { titulo: 'Cuotas', ancho: 9, valor: (p) => p.cantidadCuotas },
  { titulo: 'Pagadas', ancho: 9, valor: (p) => p.pagadas },
  { titulo: 'Vencidas', ancho: 10, valor: (p) => p.vencidas },
  { titulo: 'Cobrado', ancho: 14, valor: (p) => p.cobrado, moneda: true },
  { titulo: 'Saldo', ancho: 14, valor: (p) => p.saldo, moneda: true },
  { titulo: 'Próximo vence', ancho: 14, valor: (p) => p.proximoVencimiento ?? '' },
  { titulo: 'Estado', ancho: 13, valor: (p) => ETIQUETA_ESTADO_PLAN[p.estado] },
];

/** Nombre de la hoja y del archivo, con el rango si corresponde. */
export function tituloDeReporte(etiqueta: string, rango: Rango, loteo?: string | null): string {
  const partes = [etiqueta];
  if (loteo) partes.push(`Loteo ${loteo}`);
  if (rango.desde || rango.hasta) {
    const desde = rango.desde ? etiquetaPeriodo(rango.desde.slice(0, 7), 'MENSUAL') : 'el inicio';
    const hasta = rango.hasta ? etiquetaPeriodo(rango.hasta.slice(0, 7), 'MENSUAL') : 'hoy';
    partes.push(`${desde} a ${hasta}`);
  }
  return partes.join(' · ');
}
