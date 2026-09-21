import { Injectable } from '@nestjs/common';
import {
  analizarHistorial,
  etiquetaParcela,
  etiquetaPeriodo,
  normalizarEncabezado,
  periodosEntre,
  resumirHistorial,
  vencimientoHistorico,
  DIA_VENCIMIENTO_HISTORICO,
  type FilaHistorial,
  type HistorialCrear,
  type ResultadoHistorial,
  type ResultadoHistorialManual,
} from '@mf/shared';
import type { AlcanceTarifa, Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha } from '../common/fechas';
import { leerPlanilla, type ArchivoSubido } from '../common/planilla';
import { PrismaService } from '../prisma/prisma.module';

/** Tope defensivo: cinco mil cuotas por archivo es más de lo que carga un club de una vez. */
const MAX_FILAS = 5000;

/** Una parcela de la base, con las titularidades que tuvo. */
interface ParcelaConTitulares {
  id: number;
  etiqueta: string;
  asignaciones: { id: number; socioId: number; desde: string; hasta: string | null }[];
}

/**
 * Historial de cuotas: lo que el socio pagó y lo que debe de antes de que el club usara el
 * sistema. Entra por dos puertas —una planilla o la ficha del socio— y en las dos termina
 * en cuotas marcadas como históricas.
 *
 * Las adeudadas son deuda como cualquier otra: se ven en la ficha, se cobran desde
 * registrar pago y acumulan interés por mora. Las pagadas quedan PAGADAS sin cobro ni
 * recibo, porque esa plata no entró por el sistema y no tiene que aparecer en la caja.
 *
 * La importación es en dos pasos sobre el mismo archivo, igual que la del padrón: la
 * previsualización dice qué va a pasar con cada fila y la importación lo aplica en una
 * sola transacción. Si al confirmar quedó alguna fila con error, no se carga nada.
 */
@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  async previsualizar(archivo: ArchivoSubido): Promise<ResultadoHistorial> {
    return (await this.analizar(archivo)).resultado;
  }

  /**
   * Crea las cuotas del archivo. Se vuelve a analizar entero: entre la previsualización y
   * la confirmación pudo cambiar cualquier cosa, y el que manda es el estado de la base.
   */
  async importar(archivo: ArchivoSubido): Promise<ResultadoHistorial> {
    const { resultado, cuotas } = await this.analizar(archivo);

    if (resultado.columnasFaltantes.length > 0) {
      throw reglaIncumplida(`Al archivo le faltan columnas: ${resultado.columnasFaltantes.join(', ')}`, 'archivo');
    }
    if (resultado.conError > 0) {
      throw conflicto(
        `El archivo tiene ${resultado.conError === 1 ? 'una fila con error' : `${resultado.conError} filas con error`}. ` +
          'Corregilas y volvé a subirlo: la carga es todo o nada.',
        'archivo',
      );
    }
    if (resultado.nuevas === 0) {
      throw conflicto('No hay nada nuevo para cargar: todas las cuotas del archivo ya están en el sistema.', 'archivo');
    }

    const datos = [...cuotas.values()];
    await this.prisma.$transaction(async (tx) => {
      // Sin skipDuplicates: si entre la vista previa y ahora alguien generó ese período,
      // el índice único lo frena y la carga entera vuelve atrás.
      await tx.cuota.createMany({ data: datos });
    });

    return resultado;
  }

  /**
   * Carga a mano desde la ficha: un tramo de períodos de una parcela o de la cuota social,
   * todos por el mismo importe. Los períodos que ya tienen cuota se saltean.
   */
  async cargar(socioId: number, datos: HistorialCrear): Promise<ResultadoHistorialManual> {
    const socio = await this.prisma.socio.findUnique({ where: { id: socioId }, select: { id: true } });
    if (!socio) throw noEncontrado('No existe el socio');

    const periodos = periodosEntre(datos.desde, datos.hasta, datos.periodicidad);
    if (periodos.length === 0) throw reglaIncumplida('El tramo no tiene ningún período', 'desde');

    let asignacionId: number | null = null;
    if (datos.parcelaId) {
      const parcela = await this.parcela(datos.parcelaId);
      if (!parcela) throw noEncontrado('No existe la parcela');
      const titularidad = titularidadDe(parcela, socioId, periodos[0]);
      if (!titularidad) {
        throw reglaIncumplida(`La parcela ${parcela.etiqueta} no es de este socio`, 'parcelaId');
      }
      asignacionId = titularidad;
    }

    const ocupados = await this.periodosOcupados([
      { socioId, parcelaId: datos.parcelaId ?? null, periodos },
    ]);

    const nuevos = periodos.filter((p) => !ocupados.has(clave(socioId, datos.parcelaId ?? null, p)));
    if (nuevos.length === 0) {
      throw conflicto('Todos esos períodos ya tienen cuota cargada en el sistema', 'desde');
    }

    await this.prisma.cuota.createMany({
      data: nuevos.map((periodo) => ({
        socioId,
        asignacionId,
        parcelaId: datos.parcelaId ?? null,
        origen: datos.parcelaId ? ('PARCELA' as const) : ('SOCIO' as const),
        periodo,
        periodicidad: datos.periodicidad,
        importe: datos.importe,
        vencimiento: aFecha(vencimientoHistorico(periodo, datos.diaVencimiento)),
        estado: datos.pagada ? ('PAGADA' as const) : ('PENDIENTE' as const),
        historica: true,
        pagadaEn: datos.pagada && datos.fechaPago ? aFecha(datos.fechaPago) : null,
      })),
    });

    return {
      creadas: nuevos.length,
      omitidas: periodos.length - nuevos.length,
      importe: nuevos.length * datos.importe,
      pagada: datos.pagada,
      desde: nuevos[0],
      hasta: nuevos[nuevos.length - 1],
    };
  }

  // ---------------------------------------------------------------- Análisis

  private async analizar(archivo: ArchivoSubido): Promise<{
    resultado: ResultadoHistorial;
    cuotas: Map<number, Prisma.CuotaCreateManyInput>;
  }> {
    const { encabezados, filas } = await leerPlanilla(archivo, MAX_FILAS);
    const analisis = analizarHistorial(encabezados, filas);
    if (analisis.columnasFaltantes.length > 0) return { resultado: analisis, cuotas: new Map() };
    return this.contrastarConLaBase(analisis);
  }

  private async contrastarConLaBase(analisis: ResultadoHistorial) {
    const pendientes = analisis.filas.filter((f) => f.estado === 'nueva' && f.cuota);
    const dnis = pendientes.flatMap((f) => (f.dni ? [f.dni] : []));
    const numeros = pendientes.flatMap((f) => (f.numero !== null ? [f.numero] : []));

    const [socios, parcelas, tarifas] = await Promise.all([
      this.prisma.socio.findMany({
        where: { OR: [{ dni: { in: dnis } }, { numero: { in: numeros } }] },
        select: { id: true, numero: true, nombre: true, apellido: true, dni: true },
      }),
      this.parcelasPorCodigo(),
      this.prisma.tarifa.findMany({ orderBy: { vigenteDesde: 'asc' } }),
    ]);

    const porDni = new Map(socios.map((s) => [s.dni, s]));
    const porNumero = new Map(socios.map((s) => [s.numero, s]));
    const diaDeVencimiento = (alcance: AlcanceTarifa, periodo: string): number => {
      const vigente = tarifas.filter((t) => t.alcance === alcance && deFecha(t.vigenteDesde).slice(0, 7) <= periodo).pop();
      return vigente?.diaVencimiento ?? DIA_VENCIMIENTO_HISTORICO;
    };

    // Primera pasada: se resuelve el socio, la parcela y la titularidad de cada fila.
    const resueltas = analisis.filas.map((f) => this.resolver(f, porDni, porNumero, parcelas));

    // Segunda: qué períodos ya tienen cuota en la base, todo en una consulta.
    const ocupados = await this.periodosOcupados(
      resueltas.flatMap((r) =>
        r.fila.estado === 'nueva' && r.socioId !== null
          ? [{ socioId: r.socioId, parcelaId: r.parcelaId, periodos: [r.fila.cuota!.periodo] }]
          : [],
      ),
    );

    const cuotas = new Map<number, Prisma.CuotaCreateManyInput>();
    const vistas = new Set<string>();

    const filas = resueltas.map(({ fila, socioId, parcelaId, asignacionId }): FilaHistorial => {
      if (fila.estado !== 'nueva' || socioId === null || !fila.cuota) return fila;

      const k = clave(socioId, parcelaId, fila.cuota.periodo);
      const etiqueta = etiquetaPeriodo(fila.cuota.periodo, fila.cuota.periodicidad);
      if (ocupados.has(k) || vistas.has(k)) {
        return {
          ...fila,
          estado: 'omitida',
          motivoOmitida: `La cuota de ${etiqueta}${fila.cuota.parcela ? ` de la parcela ${fila.cuota.parcela}` : ' social'} ya está en el sistema`,
        };
      }
      vistas.add(k);

      const alcance: AlcanceTarifa = fila.cuota.origen === 'SOCIO' ? 'SOCIO' : 'PARCELA';
      cuotas.set(fila.fila, {
        socioId,
        asignacionId,
        parcelaId,
        origen: fila.cuota.origen,
        periodo: fila.cuota.periodo,
        periodicidad: fila.cuota.periodicidad,
        importe: fila.cuota.importe,
        vencimiento: aFecha(fila.cuota.vencimiento ?? vencimientoHistorico(fila.cuota.periodo, diaDeVencimiento(alcance, fila.cuota.periodo))),
        estado: fila.cuota.pagada ? 'PAGADA' : 'PENDIENTE',
        historica: true,
        pagadaEn: fila.cuota.pagada && fila.cuota.fechaPago ? aFecha(fila.cuota.fechaPago) : null,
      });
      return fila;
    });

    // Las filas que quedaron con error o se omitieron no se cargan.
    for (const f of filas) if (f.estado !== 'nueva') cuotas.delete(f.fila);

    return { resultado: resumirHistorial(filas, analisis.columnasFaltantes), cuotas };
  }

  /** Busca el socio y la parcela de una fila, y anota el error si algo no cierra. */
  private resolver(
    fila: FilaHistorial,
    porDni: Map<string, { id: number; numero: number; nombre: string; apellido: string }>,
    porNumero: Map<number, { id: number; numero: number; nombre: string; apellido: string }>,
    parcelas: Map<string, ParcelaConTitulares>,
  ): { fila: FilaHistorial; socioId: number | null; parcelaId: number | null; asignacionId: number | null } {
    if (fila.estado !== 'nueva' || !fila.cuota) return { fila, socioId: null, parcelaId: null, asignacionId: null };

    const socio = (fila.dni && porDni.get(fila.dni)) || (fila.numero !== null && porNumero.get(fila.numero)) || null;
    if (!socio) {
      const como = fila.dni ? `el DNI ${fila.dni}` : `el número ${fila.numero}`;
      return { fila: conError(fila, `No hay ningún socio con ${como}: cargalo antes de importar su historial`), socioId: null, parcelaId: null, asignacionId: null };
    }
    const conSocio = { ...fila, socio };

    if (fila.cuota.origen === 'SOCIO') {
      return { fila: conSocio, socioId: socio.id, parcelaId: null, asignacionId: null };
    }

    const parcela = buscarParcela(parcelas, fila.cuota.parcela ?? '', fila.cuota.manzana);
    if (!parcela) {
      return { fila: conError(conSocio, `No existe la parcela ${fila.cuota.parcela}`), socioId: null, parcelaId: null, asignacionId: null };
    }

    const asignacionId = titularidadDe(parcela, socio.id, fila.cuota.periodo);
    if (asignacionId === null) {
      return {
        fila: conError(conSocio, `La parcela ${parcela.etiqueta} no es de ${socio.apellido} ${socio.nombre}: asignásela antes de importar`),
        socioId: null,
        parcelaId: null,
        asignacionId: null,
      };
    }
    return { fila: conSocio, socioId: socio.id, parcelaId: parcela.id, asignacionId };
  }

  // ---------------------------------------------------------------- Consultas

  /**
   * Los períodos que ya tienen cuota, sea del estado que sea: una anulada o una
   * refinanciada también ocupan el lugar, igual que para la generación.
   */
  private async periodosOcupados(
    pedidos: { socioId: number; parcelaId: number | null; periodos: string[] }[],
  ): Promise<Set<string>> {
    if (pedidos.length === 0) return new Set();

    const deParcela = pedidos.filter((p) => p.parcelaId !== null);
    const sociales = pedidos.filter((p) => p.parcelaId === null);

    const [porParcela, porSocio] = await Promise.all([
      deParcela.length
        ? this.prisma.cuota.findMany({
            where: {
              origen: 'PARCELA',
              OR: deParcela.map((p) => ({ parcelaId: p.parcelaId!, periodo: { in: p.periodos } })),
            },
            select: { socioId: true, parcelaId: true, periodo: true },
          })
        : [],
      sociales.length
        ? this.prisma.cuota.findMany({
            where: {
              origen: 'SOCIO',
              OR: sociales.map((p) => ({ socioId: p.socioId, periodo: { in: p.periodos } })),
            },
            select: { socioId: true, parcelaId: true, periodo: true },
          })
        : [],
    ]);

    const ocupados = new Set<string>();
    // La de parcela ocupa el período de la parcela, la tenga el socio que la tenga.
    for (const c of porParcela) for (const p of deParcela) if (p.parcelaId === c.parcelaId) ocupados.add(clave(p.socioId, c.parcelaId, c.periodo));
    for (const c of porSocio) ocupados.add(clave(c.socioId, null, c.periodo));
    return ocupados;
  }

  private async parcela(id: number): Promise<ParcelaConTitulares | null> {
    const p = await this.prisma.parcela.findUnique({
      where: { id },
      select: {
        id: true,
        codigo: true,
        sector: { select: { id: true, nombre: true, loteo: { select: { id: true, nombre: true } } } },
        asignaciones: { select: { id: true, socioId: true, desde: true, hasta: true } },
      },
    });
    return p ? aParcelaConTitulares(p) : null;
  }

  /**
   * Las parcelas por código y por «loteo · código», y también por «manzana|código», para
   * poder escribirlas de cualquiera de las formas. El código solo es único dentro del
   * sector, así que los repetidos se resuelven por la forma larga o por la manzana.
   */
  private async parcelasPorCodigo(): Promise<Map<string, ParcelaConTitulares>> {
    const parcelas = await this.prisma.parcela.findMany({
      select: {
        id: true,
        codigo: true,
        sector: { select: { id: true, nombre: true, loteo: { select: { id: true, nombre: true } } } },
        asignaciones: { select: { id: true, socioId: true, desde: true, hasta: true } },
      },
    });

    const mapa = new Map<string, ParcelaConTitulares>();
    const repetidos = new Set<string>();
    for (const p of parcelas) {
      const dato = aParcelaConTitulares(p);
      mapa.set(normalizarEncabezado(dato.etiqueta), dato);
      if (p.sector) mapa.set(`${normalizarEncabezado(p.sector.nombre)}|${normalizarEncabezado(p.codigo)}`, dato);

      const corto = normalizarEncabezado(p.codigo);
      // Con el código pelado gana el primero, pero si se repite deja de servir.
      if (repetidos.has(corto)) mapa.delete(corto);
      else {
        mapa.set(corto, dato);
        repetidos.add(corto);
      }
    }
    return mapa;
  }
}

const clave = (socioId: number, parcelaId: number | null, periodo: string): string =>
  parcelaId === null ? `SOCIO|${socioId}|${periodo}` : `PARCELA|${parcelaId}|${periodo}`;

const conError = (fila: FilaHistorial, error: string): FilaHistorial => ({
  ...fila,
  estado: 'error',
  errores: [...fila.errores, error],
});

const aParcelaConTitulares = (p: {
  id: number;
  codigo: string;
  sector: { id: number; nombre: string; loteo: { id: number; nombre: string } | null } | null;
  asignaciones: { id: number; socioId: number; desde: Date; hasta: Date | null }[];
}): ParcelaConTitulares => ({
  id: p.id,
  etiqueta: etiquetaParcela(p),
  asignaciones: p.asignaciones.map((a) => ({
    id: a.id,
    socioId: a.socioId,
    desde: deFecha(a.desde),
    hasta: a.hasta ? deFecha(a.hasta) : null,
  })),
});

/** La parcela escrita como «7-1», como «Lavalle · 7-1» o partida en manzana y lote. */
function buscarParcela(parcelas: Map<string, ParcelaConTitulares>, codigo: string, manzana: string | null) {
  const normalizado = normalizarEncabezado(codigo);
  if (manzana) {
    const conManzana = normalizarEncabezado(manzana);
    // En la planilla el lote puede estar escrito entero, «7-1», o solo «1».
    const lote = normalizarEncabezado(codigo.slice(manzana.length + 1));
    const encontrada = parcelas.get(`${conManzana}|${normalizado}`) ?? parcelas.get(`${conManzana}|${lote}`);
    if (encontrada) return encontrada;
  }
  return parcelas.get(normalizado) ?? null;
}

/**
 * Qué titularidad del socio cubre ese período. Se prefiere la que lo contiene; si ninguna
 * lo hace —lo habitual, porque la asignación se cargó el día que se armó el sistema y el
 * historial es anterior— vale la más vieja que tenga ese socio sobre la parcela.
 */
function titularidadDe(parcela: ParcelaConTitulares, socioId: number, periodo: string): number | null {
  const suyas = parcela.asignaciones
    .filter((a) => a.socioId === socioId)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (suyas.length === 0) return null;

  const contiene = suyas.find((a) => a.desde.slice(0, 7) <= periodo && (!a.hasta || a.hasta.slice(0, 7) >= periodo));
  return (contiene ?? suyas[0]).id;
}
