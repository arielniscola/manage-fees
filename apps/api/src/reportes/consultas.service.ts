import { Injectable } from '@nestjs/common';
import {
  ETIQUETA_DESTINO_CUOTAS,
  ETIQUETA_ESTADO_PLAN,
  type TipoReporte,
  ETIQUETA_MEDIO_PAGO,
  etiquetaPeriodo,
  hoy,
  numeroDeParcela,
  numeroDevolucion,
  numeroPlan,
  numeroRecibo,
  type CobroListItem,
  type DevolucionListItem,
  type MedioPago,
  type PlanListItem,
  type SocioListItem,
  type SocioResumen,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { CobrosService } from '../cobros/cobros.service';
import { DevolucionesService } from '../cobros/devoluciones.service';
import { aFecha } from '../common/fechas';
import { cuotasDelLoteo, parcelasDelLoteo, sociosDelLoteo, sqlCobroDelLoteo, sqlCuotaDelLoteo } from '../common/loteo';
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
    private readonly devoluciones: DevolucionesService,
    private readonly planes: PlanesService,
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

  /** Devoluciones del rango por su propia fecha, anuladas incluidas y marcadas como tales. */
  async devolucionesDelRango(rango: Rango): Promise<{ filas: DevolucionListItem[]; total: number; cantidad: number }> {
    const { items, resumen } = await this.devoluciones.listar({
      desde: rango.desde,
      hasta: rango.hasta,
      loteoId: rango.loteoId,
      estado: 'todas',
      page: 1,
      pageSize: TODOS,
    });
    return { filas: items, total: resumen.total, cantidad: resumen.devoluciones };
  }

  /**
   * Lo que entró y lo que salió en el rango: cada cobro el día que se cobró y cada
   * devolución, restando, el día que se devolvió. El total de lo que cuenta es la
   * recaudación neta del panel.
   */
  async cajaDelRango(rango: Rango): Promise<MovimientoCaja[]> {
    const [cobros, devoluciones] = await Promise.all([this.cobrosDelRango(rango), this.devolucionesDelRango(rango)]);
    const movimientos: MovimientoCaja[] = [
      ...cobros.filas.map(
        (c): MovimientoCaja => ({
          tipo: 'Cobro',
          comprobante: numeroRecibo(c.numeroRecibo),
          fecha: c.fecha,
          socio: c.socio,
          medio: c.medio,
          cuotas: c.cantidadCuotas,
          importe: c.total,
          estado: c.anulado ? 'Anulado' : c.devolucion ? 'Devuelto' : 'Vigente',
          cuenta: !c.anulado,
          referencia: c.devolucion ? `Devolución N° ${numeroDevolucion(c.devolucion.numero)}` : '',
          motivo: c.motivoAnulacion ?? '',
          registradoPor: c.registradoPor,
        }),
      ),
      ...devoluciones.filas.map(
        (d): MovimientoCaja => ({
          tipo: 'Devolución',
          comprobante: numeroDevolucion(d.numero),
          fecha: d.fecha,
          socio: d.socio,
          medio: d.medio,
          cuotas: d.cantidadCuotas,
          importe: -d.importe,
          estado: d.anulada ? 'Anulada' : 'Vigente',
          cuenta: !d.anulada,
          referencia: `Recibo N° ${numeroRecibo(d.cobro.numeroRecibo)}`,
          motivo: d.anulada ? `${d.motivo} · Anulada: ${d.motivoAnulacion ?? ''}` : d.motivo,
          registradoPor: d.registradoPor,
        }),
      ),
    ];
    // Como el listado de cobros: lo más nuevo primero.
    return movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));
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
   * Deuda impaga al día de hoy, sin mora. No depende del rango: una cuota impaga no tiene corte.
   */
  async deuda(loteoId?: number): Promise<{ total: number; vencida: number; cuotas: number; cuotasVencidas: number }> {
    const impagas: Prisma.CuotaWhereInput = { estado: 'PENDIENTE', ...cuotasDelLoteo(loteoId) };
    const sumar = { _sum: { importe: true }, _count: true } as const;
    const [todas, vencidas] = await Promise.all([
      this.prisma.cuota.aggregate({ where: impagas, ...sumar }),
      this.prisma.cuota.aggregate({ where: { AND: [impagas, { vencimiento: { lt: aFecha(hoy()) } }] }, ...sumar }),
    ]);
    return {
      total: todas._sum.importe ?? 0,
      vencida: vencidas._sum.importe ?? 0,
      cuotas: todas._count,
      cuotasVencidas: vencidas._count,
    };
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
      ${sqlCobroDelLoteo(Prisma.sql`c`, loteoId)}
      GROUP BY 1
    `;
    // Lo devuelto resta en el mes en que se devolvió, no en el del cobro.
    const devuelto = await this.prisma.$queryRaw<{ mes: string; monto: bigint }[]>`
      SELECT to_char(d."fecha", 'YYYY-MM') AS mes, COALESCE(SUM(d."importe"), 0)::bigint AS monto
      FROM "Devolucion" d
      JOIN "Cobro" c ON c."id" = d."cobroId"
      WHERE d."anuladaEn" IS NULL AND d."fecha" >= ${desde}
      ${sqlCobroDelLoteo(Prisma.sql`c`, loteoId)}
      GROUP BY 1
    `;
    const emitido = await this.prisma.$queryRaw<{ mes: string; monto: bigint }[]>`
      SELECT to_char(cu."vencimiento", 'YYYY-MM') AS mes, COALESCE(SUM(cu."importe"), 0)::bigint AS monto
      FROM "Cuota" cu
      WHERE cu."estado" IN ('PENDIENTE', 'PAGADA') AND cu."vencimiento" >= ${desde}
      ${sqlCuotaDelLoteo(Prisma.sql`cu`, loteoId)}
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
    for (const f of devuelto) {
      const actual = meses.get(f.mes) ?? { emitido: 0, cobrado: 0 };
      actual.cobrado -= Number(f.monto);
      meses.set(f.mes, actual);
    }
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
  cobros: ((m: MovimientoCaja) => m.cuenta) as (fila: never) => boolean,
  devoluciones: ((d: DevolucionListItem) => !d.anulada) as (fila: never) => boolean,
};

/** Una fila del reporte de cobros: un cobro, o una devolución con su importe en negativo. */
export interface MovimientoCaja {
  tipo: 'Cobro' | 'Devolución';
  comprobante: string;
  fecha: string;
  socio: SocioResumen & { dni: string };
  medio: MedioPago;
  cuotas: number;
  /** Centavos: positivo lo que entró, negativo lo que se devolvió. */
  importe: number;
  estado: string;
  /** Lo anulado no suma en el total. */
  cuenta: boolean;
  /** El otro comprobante: la devolución de un cobro devuelto, o el recibo que se devolvió. */
  referencia: string;
  motivo: string;
  registradoPor: string;
}

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

export const COLUMNAS_COBROS: Columna<MovimientoCaja>[] = [
  { titulo: 'Tipo', ancho: 12, valor: (m) => m.tipo },
  { titulo: 'Comprobante', ancho: 13, valor: (m) => m.comprobante },
  { titulo: 'Fecha', ancho: 12, valor: (m) => m.fecha },
  { titulo: 'N° socio', ancho: 10, valor: (m) => m.socio.numero },
  { titulo: 'Socio', ancho: 26, valor: (m) => `${m.socio.apellido}, ${m.socio.nombre}` },
  { titulo: 'DNI', ancho: 12, valor: (m) => m.socio.dni },
  { titulo: 'Medio', ancho: 15, valor: (m) => ETIQUETA_MEDIO_PAGO[m.medio] },
  { titulo: 'Cuotas', ancho: 9, valor: (m) => m.cuotas },
  { titulo: 'Importe', ancho: 14, valor: (m) => m.importe, moneda: true },
  { titulo: 'Estado', ancho: 11, valor: (m) => m.estado },
  { titulo: 'Referencia', ancho: 22, valor: (m) => m.referencia },
  { titulo: 'Registró', ancho: 18, valor: (m) => m.registradoPor },
  { titulo: 'Motivo', ancho: 30, valor: (m) => m.motivo },
];

export const COLUMNAS_DEVOLUCIONES: Columna<DevolucionListItem>[] = [
  { titulo: 'Comprobante', ancho: 13, valor: (d) => numeroDevolucion(d.numero) },
  { titulo: 'Fecha', ancho: 12, valor: (d) => d.fecha },
  { titulo: 'N° socio', ancho: 10, valor: (d) => d.socio.numero },
  { titulo: 'Socio', ancho: 26, valor: (d) => `${d.socio.apellido}, ${d.socio.nombre}` },
  { titulo: 'DNI', ancho: 12, valor: (d) => d.socio.dni },
  { titulo: 'Recibo devuelto', ancho: 15, valor: (d) => numeroRecibo(d.cobro.numeroRecibo) },
  { titulo: 'Fecha del cobro', ancho: 15, valor: (d) => d.cobro.fecha },
  { titulo: 'Medio', ancho: 15, valor: (d) => ETIQUETA_MEDIO_PAGO[d.medio] },
  { titulo: 'Cuotas', ancho: 9, valor: (d) => d.cantidadCuotas },
  { titulo: 'Las cuotas', ancho: 20, valor: (d) => ETIQUETA_DESTINO_CUOTAS[d.destinoCuotas] },
  { titulo: 'Importe', ancho: 14, valor: (d) => d.importe, moneda: true },
  { titulo: 'Estado', ancho: 11, valor: (d) => (d.anulada ? 'Anulada' : 'Vigente') },
  { titulo: 'Motivo', ancho: 30, valor: (d) => d.motivo },
  { titulo: 'Registró', ancho: 18, valor: (d) => d.registradoPor },
  { titulo: 'Motivo de anulación', ancho: 30, valor: (d) => d.motivoAnulacion ?? '' },
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
  { titulo: 'DNI', ancho: 12, valor: (p) => p.socio.dni },
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
