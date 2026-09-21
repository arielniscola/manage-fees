import { Injectable, Logger } from '@nestjs/common';
import {
  etiquetaPeriodo,
  hoy,
  inicioPeriodo,
  MESES_DE,
  mesActual,
  mesDe,
  primerDia,
  sumarMeses,
  vencimientoDe,
  type AlcanceTarifa,
  type GenerarCuotas,
  type PeriodoGenerado,
  type ResultadoGeneracion,
} from '@mf/shared';
import type { Periodicidad, Prisma, Tarifa } from '@prisma/client';
import { aFecha, deFecha, deFechaNullable } from '../common/fechas';
import { PrismaService } from '../prisma/prisma.module';
import { mesVigencia } from './tarifas.service';

/**
 * La generación crea las cuotas del período: una por cada parcela asignada, que es el pago
 * por la propiedad del terreno, y una cuota social por socio. Las de plan no se generan acá.
 */
export type Candidata = Prisma.CuotaCreateManyInput & {
  periodo: string;
  periodicidad: Periodicidad;
  origen: 'PARCELA' | 'SOCIO';
};

/** La generación también corre dentro de la transacción de un cobro adelantado. */
type Cliente = Prisma.TransactionClient;

/** Tope defensivo por asignación: sin él, una fecha disparatada podría generar millones de filas. */
const MAX_PERIODOS = 600;

@Injectable()
export class GeneracionService {
  private readonly log = new Logger('Cuotas');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera las cuotas que falten hasta el período que haya empezado en la fecha indicada:
   * las de cada parcela asignada y la social de cada socio que tenga alguna. El suplente,
   * que no tiene ninguna, no genera nada.
   *
   * Es idempotente: recalcula todo desde cero, descarta lo que ya existe y confía en los
   * índices únicos (parcela + período y socio + período) como última red si dos procesos
   * corren a la vez.
   */
  async generar({ hasta, simular }: GenerarCuotas): Promise<ResultadoGeneracion> {
    const tarifas = await this.prisma.tarifa.findMany({ orderBy: { vigenteDesde: 'asc' } });
    const porAlcance = {
      PARCELA: tarifas.filter((t) => t.alcance === 'PARCELA'),
      SOCIO: tarifas.filter((t) => t.alcance === 'SOCIO'),
    };
    if (tarifas.length === 0) {
      return { hasta, simulado: simular, periodos: [], cuotas: 0, importe: 0, socios: 0, yaExistian: 0, sinTarifa: true };
    }

    const candidatas = await this.calcular(porAlcance, hasta, this.prisma);
    const existentes = await this.clavesExistentes(candidatas, this.prisma);
    const nuevas = candidatas.filter((c) => !existentes.has(clave(c)));

    if (!simular && nuevas.length > 0) {
      const { count } = await this.prisma.cuota.createMany({ data: nuevas, skipDuplicates: true });
      this.log.log(`Generadas ${count} cuotas hasta ${hasta}`);
    }

    return {
      hasta,
      simulado: simular,
      periodos: this.resumirPorPeriodo(nuevas),
      cuotas: nuevas.length,
      importe: nuevas.reduce((t, c) => t + c.importe, 0),
      socios: new Set(nuevas.map((c) => c.socioId)).size,
      yaExistian: candidatas.length - nuevas.length,
      sinTarifa: false,
    };
  }

  /** Corrida diaria: genera hasta hoy y deja el resultado en el log. */
  async generarHastaHoy(): Promise<ResultadoGeneracion> {
    const resultado = await this.generar({ hasta: hoy(), simular: false });
    if (resultado.sinTarifa) this.log.warn('No hay ninguna tarifa configurada: no se generaron cuotas');
    else if (resultado.cuotas === 0) this.log.log('No había cuotas pendientes de generar');
    return resultado;
  }

  /**
   * Las cuotas que le faltan a un socio para quedar pago hasta un mes futuro, ya
   * descontadas las que existen. No escribe nada: quien adelanta las crea dentro de su
   * propia transacción, junto con el cobro que las cancela.
   *
   * Solo mira los períodos que empiezan después del mes en curso: el período actual lo
   * genera la corrida de todos los días, y su titular puede no ser el mismo que hoy.
   */
  async candidatasDeSocio(socioId: number, hastaMes: string, db: Cliente = this.prisma): Promise<Candidata[]> {
    const tarifas = await db.tarifa.findMany({ orderBy: { vigenteDesde: 'asc' } });
    if (tarifas.length === 0) return [];

    const porAlcance = {
      PARCELA: tarifas.filter((t) => t.alcance === 'PARCELA'),
      SOCIO: tarifas.filter((t) => t.alcance === 'SOCIO'),
    };
    const desde = mesActual();
    const candidatas = (await this.calcular(porAlcance, primerDia(hastaMes), db, socioId)).filter(
      (c) => c.periodo > desde && c.socioId === socioId,
    );
    const existentes = await this.clavesExistentes(candidatas, db);
    return candidatas.filter((c) => !existentes.has(clave(c))).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }

  private async calcular(
    tarifas: Record<AlcanceTarifa, Tarifa[]>,
    hasta: string,
    db: Cliente,
    socioId?: number,
  ): Promise<Candidata[]> {
    const limite = mesDe(hasta);

    const asignaciones = await db.asignacion.findMany({
      where: { desde: { lte: aFecha(hasta) }, ...(socioId && { socioId }) },
      select: { id: true, socioId: true, parcelaId: true, desde: true, hasta: true },
      // La más vieja primero: si una parcela cambió de titular dentro del período,
      // la cuota queda a nombre de quien era titular cuando el período empezó.
      orderBy: [{ desde: 'asc' }, { id: 'asc' }],
    });

    return [
      ...this.cuotasDeParcela(tarifas.PARCELA, asignaciones, limite),
      ...this.cuotasSociales(tarifas.SOCIO, asignaciones, limite),
    ];
  }

  /** Una cuota por parcela asignada y período, a nombre del titular de ese momento. */
  private cuotasDeParcela(tarifas: Tarifa[], asignaciones: Asignacion[], limite: string): Candidata[] {
    if (tarifas.length === 0) return [];
    const primerMes = mesVigencia(tarifas[0]);
    const candidatas: Candidata[] = [];
    const vistas = new Set<string>();

    for (const a of asignaciones) {
      for (const { periodo, tarifa } of this.periodos(tarifas, a, limite, primerMes)) {
        const k = `PARCELA|${a.parcelaId}|${periodo}`;
        if (vistas.has(k)) continue;
        vistas.add(k);
        candidatas.push({
          asignacionId: a.id,
          socioId: a.socioId,
          parcelaId: a.parcelaId,
          tarifaId: tarifa.id,
          periodo,
          periodicidad: tarifa.periodicidad,
          importe: tarifa.importe,
          vencimiento: aFecha(vencimientoDe(periodo, tarifa.diaVencimiento)),
          origen: 'PARCELA',
        });
      }
    }
    return candidatas;
  }

  /**
   * Una cuota social por socio y período, sin parcela. Solo la generan los socios que
   * tuvieron alguna parcela en ese período: el suplente no paga. Vale la misma regla que
   * para las de parcela, así que perder la última parcela a mitad del período no borra la
   * cuota social de ese período.
   */
  private cuotasSociales(tarifas: Tarifa[], asignaciones: Asignacion[], limite: string): Candidata[] {
    if (tarifas.length === 0) return [];
    const primerMes = mesVigencia(tarifas[0]);

    // Los meses en que cada socio tuvo alguna parcela, sin importar cuál.
    const conParcela = new Map<number, Set<string>>();
    for (const a of asignaciones) {
      const meses = conParcela.get(a.socioId) ?? new Set<string>();
      const desde = mesDe(deFecha(a.desde));
      const cierre = deFechaNullable(a.hasta);
      const tope = cierre ? minimo(limite, mesDe(cierre)) : limite;
      for (let mes = maximo(desde, primerMes), n = 0; mes <= tope && n < MAX_PERIODOS; mes = sumarMeses(mes, 1), n++) {
        meses.add(mes);
      }
      conParcela.set(a.socioId, meses);
    }

    const candidatas: Candidata[] = [];
    for (const [socioId, meses] of conParcela) {
      if (meses.size === 0) continue;
      const ordenados = [...meses].sort();
      const ultimo = ordenados[ordenados.length - 1];
      let cursor = inicioPeriodo(ordenados[0], this.tarifaEn(tarifas, ordenados[0]).periodicidad);
      if (cursor < primerMes) cursor = sumarMeses(cursor, MESES_DE[this.tarifaEn(tarifas, cursor).periodicidad]);

      for (let n = 0; cursor <= minimo(limite, ultimo) && n < MAX_PERIODOS; n++) {
        const tarifa = this.tarifaEn(tarifas, cursor);
        const largo = MESES_DE[tarifa.periodicidad];
        // Un período anual se cobra si el socio tuvo parcela en alguno de sus meses.
        const tuvoParcela = Array.from({ length: largo }, (_, i) => sumarMeses(cursor, i)).some((m) => meses.has(m));
        if (tuvoParcela) {
          candidatas.push({
            socioId,
            tarifaId: tarifa.id,
            periodo: cursor,
            periodicidad: tarifa.periodicidad,
            importe: tarifa.importe,
            vencimiento: aFecha(vencimientoDe(cursor, tarifa.diaVencimiento)),
            origen: 'SOCIO',
          });
        }
        cursor = sumarMeses(cursor, largo);
      }
    }
    return candidatas;
  }

  /** Los períodos que le corresponden a una asignación, con la tarifa que rige en cada uno. */
  private *periodos(tarifas: Tarifa[], a: Asignacion, limite: string, primerMes: string) {
    const desde = mesDe(deFecha(a.desde));
    const cierre = deFechaNullable(a.hasta);
    const tope = cierre ? minimo(limite, mesDe(cierre)) : limite;

    let cursor = inicioPeriodo(maximo(desde, primerMes), this.tarifaEn(tarifas, maximo(desde, primerMes)).periodicidad);
    // Un período que arranca antes de la primera tarifa no se cobra: se empieza por el siguiente.
    if (cursor < primerMes) cursor = sumarMeses(cursor, MESES_DE[this.tarifaEn(tarifas, cursor).periodicidad]);

    for (let n = 0; cursor <= tope && n < MAX_PERIODOS; n++) {
      const tarifa = this.tarifaEn(tarifas, cursor);
      yield { periodo: cursor, tarifa };
      cursor = sumarMeses(cursor, MESES_DE[tarifa.periodicidad]);
    }
  }

  /** La tarifa que rige en un mes: la última que empezó a regir en o antes de ese mes. */
  private tarifaEn(tarifas: Tarifa[], mes: string): Tarifa {
    let elegida = tarifas[0];
    for (const t of tarifas) {
      if (mesVigencia(t) > mes) break;
      elegida = t;
    }
    return elegida;
  }

  private async clavesExistentes(candidatas: Candidata[], db: Cliente): Promise<Set<string>> {
    if (candidatas.length === 0) return new Set();
    const desde = candidatas.reduce((min, c) => (c.periodo < min ? c.periodo : min), candidatas[0].periodo);
    const parcelaIds = [...new Set(candidatas.flatMap((c) => (c.parcelaId ? [c.parcelaId] : [])))];
    const socioIds = [...new Set(candidatas.flatMap((c) => (c.origen === 'SOCIO' ? [c.socioId] : [])))];

    // Cuentan también las anuladas y las refinanciadas: ya ocupan el lugar del período.
    const [deParcela, sociales] = await Promise.all([
      parcelaIds.length
        ? db.cuota.findMany({
            where: { origen: 'PARCELA', parcelaId: { in: parcelaIds }, periodo: { gte: desde } },
            select: { parcelaId: true, periodo: true },
          })
        : [],
      socioIds.length
        ? db.cuota.findMany({
            where: { origen: 'SOCIO', socioId: { in: socioIds }, periodo: { gte: desde } },
            select: { socioId: true, periodo: true },
          })
        : [],
    ]);

    return new Set([
      ...deParcela.flatMap((c) => (c.parcelaId === null ? [] : [`PARCELA|${c.parcelaId}|${c.periodo}`])),
      ...sociales.map((c) => `SOCIO|${c.socioId}|${c.periodo}`),
    ]);
  }

  private resumirPorPeriodo(nuevas: Candidata[]): PeriodoGenerado[] {
    const porPeriodo = new Map<string, PeriodoGenerado>();
    for (const c of nuevas) {
      const actual = porPeriodo.get(c.periodo);
      if (actual) {
        actual.cantidad += 1;
        actual.importe += c.importe;
      } else {
        porPeriodo.set(c.periodo, {
          periodo: c.periodo,
          etiqueta: etiquetaPeriodo(c.periodo, c.periodicidad),
          vencimiento: deFecha(c.vencimiento as Date),
          cantidad: 1,
          importe: c.importe,
        });
      }
    }
    return [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  }
}

interface Asignacion {
  id: number;
  socioId: number;
  parcelaId: number;
  desde: Date;
  hasta: Date | null;
}

const clave = (c: Candidata) => (c.origen === 'SOCIO' ? `SOCIO|${c.socioId}|${c.periodo}` : `PARCELA|${c.parcelaId}|${c.periodo}`);
const maximo = (a: string, b: string) => (a >= b ? a : b);
const minimo = (a: string, b: string) => (a <= b ? a : b);
