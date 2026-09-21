import { z } from 'zod';
import { fechaSchema } from './common';
import { importeSchema, aCentavos } from './dinero';
import { mesSchema } from './cuotas';
import { fechaDeTexto, normalizarEncabezado } from './importacion';
import {
  etiquetaPeriodo,
  inicioPeriodo,
  MESES,
  MESES_DE,
  PERIODICIDADES,
  sumarMeses,
  vencimientoDe,
  type Periodicidad,
} from './periodos';

/**
 * Historial de cuotas: lo que el socio pagó y lo que debe de antes de que el club usara el
 * sistema. Se carga de dos formas, la planilla y la ficha del socio, y las dos terminan en
 * las mismas cuotas, marcadas como históricas.
 *
 * Una cuota histórica no sale de ninguna tarifa —el importe lo trae la planilla, porque la
 * cuota de 2023 valía lo que valía— y las que ya estaban pagas no emiten recibo: quedan
 * PAGADAS sin cobro, así la caja del club sigue mostrando solo lo que cobró de verdad. Las
 * adeudadas son cuotas pendientes como cualquier otra: entran en la deuda del socio, se
 * cobran desde registrar pago y acumulan interés por mora si está activo.
 */

/** Las columnas que entiende el archivo, con los nombres alternativos más habituales. */
export const COLUMNAS_HISTORIAL = {
  dni: ['dni', 'documento', 'doc', 'nrodocumento'],
  numero: ['numero', 'nro', 'nsocio', 'ndesocio', 'nrosocio', 'nrodesocio', 'numerosocio', 'numerodesocio', 'socio'],
  /** Código completo, «7-1». Vacío = cuota social. */
  parcela: ['parcela', 'lote', 'codigo', 'codigoparcela'],
  /** O la manzana y el lote por separado: el código se arma «manzana-lote». */
  manzana: ['manzana', 'manzanasector', 'mz', 'mzna', 'sector'],
  loteNumero: ['nlote', 'nrolote', 'numerolote', 'loten'],
  periodo: ['periodo', 'mes', 'periodocuota', 'mescuota', 'cuota'],
  importe: ['importe', 'monto', 'valor', 'total'],
  estado: ['estado', 'situacion', 'condicion', 'pago', 'pagada', 'pagado'],
  fechaPago: ['fechapago', 'fechadepago', 'pagoel', 'fechacobro', 'fechadecobro'],
  vencimiento: ['vencimiento', 'vence', 'fechavencimiento', 'fechadevencimiento'],
  periodicidad: ['periodicidad', 'frecuencia'],
} as const;

export type ColumnaHistorial = keyof typeof COLUMNAS_HISTORIAL;

export const ETIQUETA_COLUMNA_HISTORIAL: Record<ColumnaHistorial, string> = {
  dni: 'DNI',
  numero: 'N° de socio',
  parcela: 'Parcela',
  manzana: 'Manzana',
  loteNumero: 'Lote',
  periodo: 'Período',
  importe: 'Importe',
  estado: 'Estado',
  fechaPago: 'Fecha de pago',
  vencimiento: 'Vencimiento',
  periodicidad: 'Periodicidad',
};

/** Qué va a pasar con una fila. La API completa `omitida` mirando la base. */
export type EstadoFilaHistorial = 'nueva' | 'omitida' | 'error';

/** Una cuota histórica ya interpretada, lista para crear. */
export interface CuotaHistorica {
  /** Sin parcela es la cuota social del período. */
  origen: 'PARCELA' | 'SOCIO';
  /** Código tal como vino en la planilla, «7-1». Null en la social. */
  parcela: string | null;
  /** La manzana, si vino en su columna: ayuda a encontrar la parcela. */
  manzana: string | null;
  periodo: string;
  periodicidad: Periodicidad;
  importe: number;
  pagada: boolean;
  /** Cuándo se pagó, si la planilla lo trae. Solo para las pagadas. */
  fechaPago: string | null;
  /** Si no viene, la API la calcula con el día de vencimiento de la tarifa o el 10. */
  vencimiento: string | null;
}

export interface FilaHistorial {
  /** Número de fila en la planilla, contando el encabezado: el que se ve en Excel. */
  fila: number;
  estado: EstadoFilaHistorial;
  /** Vacío si la fila está bien. Un renglón por problema, en castellano. Bloquean. */
  errores: string[];
  /** Datos que se descartan o se interpretaron a ojo. No bloquean. */
  advertencias: string[];
  /** Por qué se omite: la cuota de ese período ya está en el sistema. */
  motivoOmitida?: string;
  /** Identificación del socio tal como vino. */
  dni: string;
  numero: number | null;
  /** El socio que la API encontró, para mostrarlo en la previsualización. */
  socio?: { id: number; numero: number; nombre: string; apellido: string };
  /** Null si la fila no se pudo interpretar. */
  cuota: CuotaHistorica | null;
  /** Lo que se leyó, para poder mostrar la fila aunque no valide. */
  crudo: { socio: string; parcela: string; periodo: string; importe: string; estado: string };
}

export interface ResultadoHistorial {
  filas: FilaHistorial[];
  total: number;
  /** Cuotas que se van a crear. */
  nuevas: number;
  omitidas: number;
  conError: number;
  conAdvertencias: number;
  /** Columnas obligatorias que el archivo no trae: con esto no se puede ni empezar. */
  columnasFaltantes: ColumnaHistorial[];
  /** Socios distintos alcanzados por las filas nuevas. */
  socios: number;
  pagadas: number;
  importePagado: number;
  adeudadas: number;
  importeAdeudado: number;
}

/** A qué columna corresponde cada encabezado del archivo. */
export function mapearColumnasHistorial(encabezados: string[]): Map<number, ColumnaHistorial> {
  const mapa = new Map<number, ColumnaHistorial>();
  const usadas = new Set<ColumnaHistorial>();

  encabezados.forEach((encabezado, i) => {
    const normalizado = normalizarEncabezado(encabezado ?? '');
    if (!normalizado) return;
    for (const [columna, alias] of Object.entries(COLUMNAS_HISTORIAL) as [ColumnaHistorial, readonly string[]][]) {
      if (usadas.has(columna) || !alias.includes(normalizado)) continue;
      mapa.set(i, columna);
      usadas.add(columna);
      return;
    }
  });
  return mapa;
}

/** Las obligatorias que faltan. El socio se identifica por DNI o por su número. */
export function columnasFaltantesHistorial(presentes: Set<ColumnaHistorial>): ColumnaHistorial[] {
  const faltan: ColumnaHistorial[] = [];
  if (!presentes.has('dni') && !presentes.has('numero')) faltan.push('dni');
  if (!presentes.has('periodo')) faltan.push('periodo');
  if (!presentes.has('importe')) faltan.push('importe');
  if (!presentes.has('estado')) faltan.push('estado');
  return faltan;
}

/**
 * Período escrito a mano: se aceptan `aaaa-mm`, `mm/aaaa`, `aaaa/mm`, el nombre del mes
 * («enero 2024», «ene-24») y una fecha entera, de la que se toma el mes.
 */
export function periodoDeTexto(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  const armar = (anio: number, mes: number): string | null =>
    mes >= 1 && mes <= 12 && anio >= 1900 && anio <= 2999 ? `${anio}-${String(mes).padStart(2, '0')}` : null;

  const isoMes = /^(\d{4})[-/](\d{1,2})$/.exec(limpio);
  if (isoMes) return armar(Number(isoMes[1]), Number(isoMes[2]));

  const mesAnio = /^(\d{1,2})[-/](\d{4})$/.exec(limpio);
  if (mesAnio) return armar(Number(mesAnio[2]), Number(mesAnio[1]));

  // «enero 2024», «ene-24», «Febrero/2025».
  const conNombre = /^([a-záéíóúñ]+)[\s\-/.]*(\d{2,4})$/i.exec(limpio.normalize('NFC'));
  if (conNombre) {
    const nombre = normalizarEncabezado(conNombre[1]);
    const indice = MESES.findIndex((m) => normalizarEncabezado(m).startsWith(nombre) && nombre.length >= 3);
    if (indice >= 0) {
      const crudo = Number(conNombre[2]);
      return armar(crudo < 100 ? 2000 + crudo : crudo, indice + 1);
    }
  }

  const fecha = fechaDeTexto(limpio);
  return fecha ? fecha.slice(0, 7) : null;
}

/** Cómo figura el estado de la cuota: pagada, adeudada o algo que no se entiende. */
export function pagadaDeTexto(texto: string): boolean | null {
  const valor = normalizarEncabezado(texto);
  if (!valor) return null;
  if (['pagada', 'pagado', 'paga', 'pago', 'si', 'cobrada', 'cobrado', 'abonada', 'abonado', 'ok', 'x'].includes(valor)) {
    return true;
  }
  if (
    ['adeudada', 'adeudado', 'adeuda', 'debe', 'deuda', 'impaga', 'impago', 'impagada', 'pendiente', 'no'].includes(valor)
  ) {
    return false;
  }
  return null;
}

/** «Mensual», «bimestral»… Devuelve null si no se entiende. */
export function periodicidadDeTexto(texto: string): Periodicidad | null {
  const valor = normalizarEncabezado(texto);
  if (!valor) return null;
  return PERIODICIDADES.find((p) => normalizarEncabezado(p) === valor) ?? null;
}

/** Los períodos que van de uno a otro, saltando según la periodicidad. */
export function periodosEntre(desde: string, hasta: string, periodicidad: Periodicidad, tope = 240): string[] {
  const salto = MESES_DE[periodicidad];
  const periodos: string[] = [];
  let cursor = inicioPeriodo(desde, periodicidad);
  const fin = inicioPeriodo(hasta, periodicidad);
  while (cursor <= fin && periodos.length < tope) {
    periodos.push(cursor);
    cursor = sumarMeses(cursor, salto);
  }
  return periodos;
}

/** La misma cuota, aunque venga en dos filas: por socio, parcela y período. */
export const claveHistorial = (dni: string, numero: number | null, c: CuotaHistorica): string =>
  `${dni || `N${numero}`}|${c.origen === 'SOCIO' ? 'SOCIAL' : normalizarEncabezado(c.parcela ?? '')}|${c.periodo}`;

/**
 * Analiza las filas de la planilla. `filas[i]` es la fila i de datos, ya sin encabezado,
 * con una celda por columna del archivo, todas como texto. No toca la base: si el socio
 * existe, si la parcela es suya y si la cuota ya está cargada lo resuelve la API.
 */
export function analizarHistorial(encabezados: string[], filas: string[][]): ResultadoHistorial {
  const columnas = mapearColumnasHistorial(encabezados);
  const presentes = new Set(columnas.values());
  const faltantes = columnasFaltantesHistorial(presentes);
  if (faltantes.length > 0) return resumirHistorial([], faltantes);

  const vistas = new Map<string, number>();

  const analizadas = filas.map((celdas, i): FilaHistorial => {
    const valor = (columna: ColumnaHistorial): string => {
      for (const [indice, nombre] of columnas) if (nombre === columna) return (celdas[indice] ?? '').trim();
      return '';
    };

    const fila = i + 2;
    const errores: string[] = [];
    const advertencias: string[] = [];

    const dni = valor('dni').replace(/[.\s-]/g, '');
    const numeroCrudo = valor('numero').replace(/[.\s]/g, '');
    const numero = /^\d+$/.test(numeroCrudo) ? Number(numeroCrudo) : null;
    if (!dni && numero === null) errores.push('Falta el DNI o el número de socio');
    else if (dni && !/^\d{6,9}$/.test(dni)) errores.push(`El DNI «${valor('dni')}» no parece un documento`);

    const periodo = periodoDeTexto(valor('periodo'));
    if (!periodo) errores.push(`No se entiende el período «${valor('periodo')}»`);

    const importe = aCentavos(valor('importe'));
    if (importe === null) errores.push(`No se entiende el importe «${valor('importe')}»`);
    else if (importe <= 0) errores.push('El importe tiene que ser mayor a 0');

    const pagada = pagadaDeTexto(valor('estado'));
    if (pagada === null) errores.push(`No se entiende el estado «${valor('estado')}»: poné Pagada o Adeudada`);

    // La parcela puede venir entera o partida en manzana y lote.
    const manzana = valor('manzana') || null;
    const lote = valor('loteNumero');
    const codigoDirecto = valor('parcela');
    const codigo = codigoDirecto || (manzana && lote ? `${manzana}-${lote}` : '');

    const periodicidadCruda = valor('periodicidad');
    let periodicidad: Periodicidad = 'MENSUAL';
    if (periodicidadCruda) {
      const leida = periodicidadDeTexto(periodicidadCruda);
      if (leida) periodicidad = leida;
      else advertencias.push(`No se entiende la periodicidad «${periodicidadCruda}»: se toma mensual`);
    }

    const vencimientoCrudo = valor('vencimiento');
    let vencimiento: string | null = null;
    if (vencimientoCrudo) {
      vencimiento = fechaDeTexto(vencimientoCrudo);
      if (!vencimiento) advertencias.push(`No se entiende el vencimiento «${vencimientoCrudo}»: se calcula solo`);
    }

    const fechaPagoCruda = valor('fechaPago');
    let fechaPago: string | null = null;
    if (fechaPagoCruda) {
      fechaPago = fechaDeTexto(fechaPagoCruda);
      if (!fechaPago) advertencias.push(`No se entiende la fecha de pago «${fechaPagoCruda}»: se importa sin ella`);
      else if (pagada === false) {
        advertencias.push('La cuota figura adeudada: la fecha de pago se descarta');
        fechaPago = null;
      }
    }

    const crudo = {
      socio: valor('dni') || (numero !== null ? `N° ${numero}` : ''),
      parcela: codigo,
      periodo: valor('periodo'),
      importe: valor('importe'),
      estado: valor('estado'),
    };

    if (errores.length > 0 || periodo === null || importe === null || pagada === null) {
      return { fila, estado: 'error', errores, advertencias, dni, numero, cuota: null, crudo };
    }

    const cuota: CuotaHistorica = {
      origen: codigo ? 'PARCELA' : 'SOCIO',
      parcela: codigo || null,
      manzana: codigoDirecto ? manzana : manzana && lote ? manzana : null,
      periodo,
      periodicidad,
      importe,
      pagada,
      fechaPago,
      vencimiento,
    };

    // La misma cuota dos veces en el archivo: la segunda no se carga.
    const clave = claveHistorial(dni, numero, cuota);
    const anterior = vistas.get(clave);
    if (anterior !== undefined) {
      errores.push(`Esta cuota ya aparece en la fila ${anterior}`);
      return { fila, estado: 'error', errores, advertencias, dni, numero, cuota, crudo };
    }
    vistas.set(clave, fila);

    return { fila, estado: 'nueva', errores, advertencias, dni, numero, cuota, crudo };
  });

  return resumirHistorial(analizadas, []);
}

/** Los totales del análisis, que se recalculan cada vez que cambia el estado de una fila. */
export function resumirHistorial(filas: FilaHistorial[], columnasFaltantes: ColumnaHistorial[] = []): ResultadoHistorial {
  const nuevas = filas.filter((f) => f.estado === 'nueva');
  const pagadas = nuevas.filter((f) => f.cuota?.pagada);
  const adeudadas = nuevas.filter((f) => f.cuota && !f.cuota.pagada);
  const sumar = (lista: FilaHistorial[]) => lista.reduce((t, f) => t + (f.cuota?.importe ?? 0), 0);

  return {
    filas,
    total: filas.length,
    nuevas: nuevas.length,
    omitidas: filas.filter((f) => f.estado === 'omitida').length,
    conError: filas.filter((f) => f.estado === 'error').length,
    conAdvertencias: filas.filter((f) => f.advertencias.length > 0).length,
    columnasFaltantes,
    socios: new Set(nuevas.map((f) => f.dni || `N${f.numero}`)).size,
    pagadas: pagadas.length,
    importePagado: sumar(pagadas),
    adeudadas: adeudadas.length,
    importeAdeudado: sumar(adeudadas),
  };
}

// ---------------------------------------------------------------- Carga a mano

/** Día de vencimiento por omisión de las cuotas históricas, igual que el de la tarifa. */
export const DIA_VENCIMIENTO_HISTORICO = 10;

/** Tope de cuotas que puede crear una carga a mano de una sola vez. */
export const MAX_CUOTAS_HISTORIAL = 240;

/**
 * Carga a mano desde la ficha del socio: un tramo de períodos de una parcela o de la
 * cuota social, todos por el mismo importe y en el mismo estado.
 */
export const historialCrearSchema = z
  .object({
    /** Null = cuota social del socio. El select manda '' cuando no hay parcela elegida. */
    parcelaId: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : v),
      z.coerce.number().int().positive('Elegí una parcela o la cuota social').nullable(),
    ),
    desde: mesSchema,
    hasta: mesSchema,
    periodicidad: z.enum(PERIODICIDADES).default('MENSUAL'),
    importe: importeSchema,
    /** Un radio manda 'true' o 'false': `coerce.boolean` tomaría las dos como verdadero. */
    pagada: z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v), z.boolean().default(true)),
    /** Solo para las pagadas; si no viene, la cuota queda paga sin fecha. */
    fechaPago: z.preprocess((v) => (v === '' || v === undefined ? null : v), fechaSchema.nullable()),
    diaVencimiento: z.coerce
      .number({ invalid_type_error: 'El día debe ser un número' })
      .int('El día debe ser un número entero')
      .min(1, 'El día debe estar entre 1 y 31')
      .max(31, 'El día debe estar entre 1 y 31')
      .default(DIA_VENCIMIENTO_HISTORICO),
  })
  .superRefine((datos, ctx) => {
    if (datos.hasta < datos.desde) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hasta'], message: 'El último período no puede ser anterior al primero' });
    }
    const cantidad = periodosEntre(datos.desde, datos.hasta, datos.periodicidad, MAX_CUOTAS_HISTORIAL + 1).length;
    if (cantidad > MAX_CUOTAS_HISTORIAL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hasta'], message: `Son más de ${MAX_CUOTAS_HISTORIAL} cuotas: cargalas en tramos` });
    }
  });
export type HistorialCrearInput = z.input<typeof historialCrearSchema>;
export type HistorialCrear = z.output<typeof historialCrearSchema>;

/** Lo que dejó una carga a mano, para el aviso de la pantalla. */
export interface ResultadoHistorialManual {
  /** Cuotas creadas. */
  creadas: number;
  /** Períodos que ya tenían cuota y se saltearon. */
  omitidas: number;
  importe: number;
  pagada: boolean;
  desde: string;
  hasta: string;
}

/** «enero 2024 – marzo 2024», para los avisos y los resúmenes. */
export function etiquetaTramo(desde: string, hasta: string, periodicidad: Periodicidad): string {
  const uno = etiquetaPeriodo(desde, periodicidad);
  return desde === hasta ? uno : `${uno} – ${etiquetaPeriodo(hasta, periodicidad)}`;
}

/** El vencimiento que le toca a una cuota histórica cuando la planilla no lo trae. */
export const vencimientoHistorico = (periodo: string, dia = DIA_VENCIMIENTO_HISTORICO): string =>
  vencimientoDe(periodo, dia);
