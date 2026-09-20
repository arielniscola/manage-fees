import { ESTADOS_CIVILES, socioCrearSchema, type EstadoCivil, type SocioCrear } from './socios';

/**
 * Importación del padrón desde una planilla. El análisis de las filas vive acá, sin tocar
 * la base: normaliza los encabezados, interpreta fechas y valores, y valida cada fila con
 * el mismo esquema que usa el alta a mano. Lo que depende de la base —si el DNI ya existe,
 * si la parcela existe y está libre— lo resuelve la API sobre este resultado.
 *
 * La planilla puede traer una fila por socio o una fila por lote, que es como la lleva el
 * club: el socio con dos lotes aparece dos veces con el mismo DNI, y las filas se juntan en
 * un solo socio. Un lote sin nombre ni DNI es un lote libre.
 */

/** Las columnas que entiende el archivo, con los nombres alternativos más habituales. */
export const COLUMNAS_IMPORTACION = {
  // «N°» a secas no: en las planillas por lote es un correlativo, no el número de socio.
  numero: ['numero', 'nro', 'nsocio', 'ndesocio', 'nrosocio', 'nrodesocio', 'numerosocio', 'numerodesocio', 'socio'],
  apellido: ['apellido', 'apellidos'],
  nombre: ['nombre', 'nombres'],
  /** Las dos cosas en una celda: «SOSA, VIVIANA BEATRIZ». */
  nombreCompleto: ['nombreyapellido', 'nombreyapellidos', 'apellidoynombre', 'apellidoynombres', 'nombrecompleto'],
  dni: ['dni', 'documento', 'doc', 'nrodocumento'],
  cuit: ['cuit', 'cuil'],
  email: ['email', 'mail', 'correo', 'correoelectronico'],
  telefono: ['telefono', 'tel', 'celular', 'movil'],
  direccion: ['direccion', 'domicilio'],
  fechaNacimiento: ['fechanacimiento', 'nacimiento', 'fechadenacimiento'],
  estadoCivil: ['estadocivil'],
  fechaAlta: ['alta', 'fechaalta', 'fechadealta', 'ingreso', 'fechaingreso'],
  observaciones: ['observaciones', 'obs', 'notas'],
  confirmado: ['confirmacion', 'confirmado'],
  fotocopiaDni: ['fotocdni', 'fotocopiadni', 'fotocopiadeldni', 'fotocopiadedni'],
  actaMatrimonio: ['actamatrimonio', 'actadematrimonio'],
  /** Códigos completos, «7-1, 7-2». */
  parcelas: ['parcelas', 'parcela', 'lotes'],
  /** O la manzana y el lote por separado: el código se arma «manzana-lote». */
  manzana: ['manzana', 'manzanasector', 'mz', 'mzna', 'manzanan', 'sector'],
  lote: ['lote', 'loten', 'nlote', 'nrolote'],
  superficie: ['m2', 'superficie', 'superficiem2', 'metros'],
} as const;

export type ColumnaImportacion = keyof typeof COLUMNAS_IMPORTACION;

/** Las que no pueden faltar. El nombre puede venir en una columna o en dos. */
export const COLUMNAS_OBLIGATORIAS: ColumnaImportacion[] = ['nombreCompleto', 'dni'];

export const ETIQUETA_COLUMNA: Record<ColumnaImportacion, string> = {
  numero: 'N° de socio',
  apellido: 'Apellido',
  nombre: 'Nombre',
  nombreCompleto: 'Nombre y apellido',
  dni: 'DNI',
  cuit: 'CUIT',
  email: 'Email',
  telefono: 'Celular',
  direccion: 'Domicilio',
  fechaNacimiento: 'Fecha de nacimiento',
  estadoCivil: 'Estado civil',
  fechaAlta: 'Fecha de alta',
  observaciones: 'Observaciones',
  confirmado: 'Confirmación',
  fotocopiaDni: 'Fotoc. DNI',
  actaMatrimonio: 'Acta matrimonio',
  parcelas: 'Parcelas',
  manzana: 'Manzana',
  lote: 'Lote',
  superficie: 'M2',
};

/**
 * Qué va a pasar con una fila. `agrupada` es otro lote de un socio que ya apareció más
 * arriba; `sinSocio` es un lote sin titular. La API completa `omitida` mirando la base.
 */
export type EstadoFila = 'nueva' | 'agrupada' | 'sinSocio' | 'omitida' | 'error';

export interface ParcelaImportada {
  /** «7-1». */
  codigo: string;
  /** La manzana, si vino en su columna: hace falta para crear la parcela si no existe. */
  manzana: string | null;
  superficieM2: number | null;
  /** Lo marca la API: la parcela no existe y se crea al importar. */
  nueva?: boolean;
}

export interface FilaImportacion {
  /** Número de fila en la planilla, contando el encabezado: el que se ve en Excel. */
  fila: number;
  estado: EstadoFila;
  /** Vacío si la fila está bien. Un renglón por problema, en castellano. Bloquean. */
  errores: string[];
  /** Datos que se descartan o se interpretaron a ojo. No bloquean. */
  advertencias: string[];
  /** Por qué se omite, cuando el socio ya existe o el lote libre ya está cargado. */
  motivoOmitida?: string;
  /** En una fila `agrupada`, la fila del mismo socio que lo da de alta. */
  agrupadaEn?: number;
  /** Los datos ya normalizados. Null si la fila no se pudo interpretar o no tiene socio. */
  socio: SocioCrear | null;
  /** Las parcelas de esta fila. Las de sus filas agrupadas se suman al importar. */
  parcelas: ParcelaImportada[];
  /** Lo que se leyó, para poder mostrar la fila aunque no valide. */
  crudo: { apellido: string; nombre: string; dni: string; numero: string };
}

export interface ResultadoImportacion {
  filas: FilaImportacion[];
  total: number;
  /** Socios que se dan de alta. */
  nuevos: number;
  omitidos: number;
  conError: number;
  conAdvertencias: number;
  /** Lotes sin titular. */
  sinSocio: number;
  /** Columnas obligatorias que el archivo no trae: con esto no se puede ni empezar. */
  columnasFaltantes: ColumnaImportacion[];
  /** Cuántas parcelas se van a asignar si se confirma. */
  asignaciones: number;
  /** Cuántas parcelas no existen y se van a crear. */
  parcelasNuevas: number;
}

/** Sin acentos, sin espacios ni signos, en minúsculas: «N° Socio» y «nro_socio» son lo mismo. */
export const normalizarEncabezado = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** A qué columna corresponde cada encabezado del archivo. */
export function mapearColumnas(encabezados: string[]): Map<number, ColumnaImportacion> {
  const mapa = new Map<number, ColumnaImportacion>();
  const usadas = new Set<ColumnaImportacion>();

  encabezados.forEach((encabezado, i) => {
    const normalizado = normalizarEncabezado(encabezado ?? '');
    if (!normalizado) return;
    for (const [columna, alias] of Object.entries(COLUMNAS_IMPORTACION) as [ColumnaImportacion, readonly string[]][]) {
      if (usadas.has(columna) || !alias.includes(normalizado)) continue;
      mapa.set(i, columna);
      usadas.add(columna);
      return;
    }
  });
  return mapa;
}

/** Las obligatorias que faltan. El nombre alcanza con «Nombre y apellido» o con las dos. */
export function columnasFaltantes(presentes: Set<ColumnaImportacion>): ColumnaImportacion[] {
  const faltan: ColumnaImportacion[] = [];
  if (!presentes.has('nombreCompleto') && !(presentes.has('apellido') && presentes.has('nombre'))) {
    faltan.push('nombreCompleto');
  }
  if (!presentes.has('dni')) faltan.push('dni');
  return faltan;
}

/**
 * Fecha escrita a mano: se aceptan `dd/mm/aaaa`, `dd-mm-aaaa`, `aaaa-mm-dd` y `ddmmaaaa`.
 * Un año de dos dígitos se interpreta como 19xx o 20xx según caiga antes o después de hoy,
 * que es lo que hace falta para fechas de nacimiento y de alta viejas.
 */
export function fechaDeTexto(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(limpio);
  if (iso) return armarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(limpio);
  if (local) {
    const anio = Number(local[3]);
    if (anio >= 100 && anio < 1000) return null;
    const completo = anio >= 100 ? anio : anio > Number(String(new Date().getUTCFullYear()).slice(2)) ? 1900 + anio : 2000 + anio;
    return armarFecha(completo, Number(local[2]), Number(local[1]));
  }

  // Una celda numérica con la fecha sin separadores: 24012000.
  const pegada = /^(\d{2})(\d{2})(\d{4})$/.exec(limpio);
  if (pegada) return armarFecha(Number(pegada[3]), Number(pegada[2]), Number(pegada[1]));
  return null;
}

function armarFecha(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha.toISOString().slice(0, 10);
}

/**
 * «Casado/a», «CASADA», «casado», «En concubinato» → el valor del enum. Devuelve null si
 * la celda está vacía y undefined si dice algo que no se reconoce.
 */
export function estadoCivilDeTexto(texto: string): EstadoCivil | null | undefined {
  const normalizado = normalizarEncabezado(texto);
  if (!normalizado) return null;
  // Las planillas escriben el género de todas las formas: «casado», «casada», «casado/a».
  const candidatos = new Set([
    normalizado,
    normalizado.replace(/oa$/, 'o'),
    normalizado.replace(/a$/, 'o'),
    normalizado.replace(/^en/, ''),
  ]);
  return ESTADOS_CIVILES.find((e) => candidatos.has(normalizarEncabezado(e))) ?? undefined;
}

/** Los códigos de parcela de una celda: «7-1, 7-2» o «7-1; 7-2». */
export const parcelasDeTexto = (texto: string): string[] =>
  texto
    .split(/[,;|]/)
    .map((c) => c.trim())
    .filter(Boolean);

/**
 * «SOSA, VIVIANA BEATRIZ» → apellido y nombre. Sin coma no hay forma de saber dónde
 * termina el apellido: se toma la primera palabra y se avisa, para revisarlo en la ficha.
 */
export function separarNombre(texto: string): { apellido: string; nombre: string; adivinado: boolean } {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const coma = limpio.indexOf(',');
  if (coma >= 0) return { apellido: limpio.slice(0, coma).trim(), nombre: limpio.slice(coma + 1).trim(), adivinado: false };
  const [apellido = '', ...resto] = limpio.split(' ');
  return { apellido, nombre: resto.join(' '), adivinado: resto.length > 0 };
}

/** Casillero de la planilla: una tilde, «Sí», «X» o VERDADERO. Undefined si no se entiende. */
export function siNoDeTexto(texto: string): boolean | undefined {
  const normalizado = normalizarEncabezado(texto);
  if (['', 'false', 'falso', 'no', '0'].includes(normalizado)) return false;
  if (['true', 'verdadero', 'si', 'x', '1', 'ok'].includes(normalizado) || texto.trim() === '✓') return true;
  return undefined;
}

/** «191,68» o 191.68 → 191.68. */
export function superficieDeTexto(texto: string): number | null | undefined {
  const limpio = texto.trim().replace(/\s*m2$/i, '');
  if (!limpio) return null;
  const numero = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : undefined;
}

/** Los campos del socio que pueden quedar vacíos: si vienen mal se descartan con un aviso. */
const OPCIONALES = new Set<string>(['cuit', 'email', 'telefono', 'direccion', 'observaciones', 'fechaNacimiento', 'estadoCivil']);

/**
 * Analiza las filas de la planilla. `filas[i]` es la fila i de datos, ya sin encabezado,
 * con una celda por columna del archivo, todas como texto.
 */
export function analizarFilas(encabezados: string[], filas: string[][]): ResultadoImportacion {
  const columnas = mapearColumnas(encabezados);
  const presentes = new Set(columnas.values());
  const faltantes = columnasFaltantes(presentes);

  const valorDe = (fila: string[], columna: ColumnaImportacion): string => {
    for (const [i, c] of columnas) if (c === columna) return (fila[i] ?? '').toString().trim();
    return '';
  };

  const analizadas: FilaImportacion[] = [];
  /** DNI → la fila que da de alta a ese socio. */
  const porDni = new Map<string, FilaImportacion>();
  const numerosVistos = new Map<string, number>();
  const cuitsVistos = new Map<string, number>();
  const parcelasVistas = new Map<string, number>();

  filas.forEach((fila, i) => {
    // +2: la fila 1 es el encabezado y las planillas cuentan desde 1.
    const numeroDeFila = i + 2;
    const errores: string[] = [];
    const advertencias: string[] = [];

    // El nombre: en dos columnas, o en una sola y hay que partirlo.
    let apellido = valorDe(fila, 'apellido');
    let nombre = valorDe(fila, 'nombre');
    const completo = valorDe(fila, 'nombreCompleto');
    if (!apellido && !nombre && completo) {
      const separado = separarNombre(completo);
      ({ apellido, nombre } = separado);
      if (separado.adivinado) {
        advertencias.push(`El nombre no tiene coma: se tomó «${apellido}» como apellido y «${nombre}» como nombre`);
      }
    }
    const crudo = { apellido, nombre, dni: valorDe(fila, 'dni'), numero: valorDe(fila, 'numero') };

    const parcelas = leerParcelas(fila, valorDe, presentes, errores, advertencias);

    // Sin nombre ni DNI la fila es un lote sin titular: se informa y no da de alta a nadie.
    if (!apellido && !nombre && !crudo.dni) {
      if (parcelas.length === 0) return;
      registrarParcelas(parcelas, numeroDeFila, parcelasVistas, errores);
      analizadas.push({
        fila: numeroDeFila,
        estado: errores.length ? 'error' : 'sinSocio',
        errores,
        advertencias,
        socio: null,
        parcelas,
        crudo,
      });
      return;
    }

    const fechaAlta = valorDe(fila, 'fechaAlta');
    const fechaAltaISO = fechaAlta ? fechaDeTexto(fechaAlta) : null;
    if (fechaAlta && !fechaAltaISO) errores.push(`No se entiende la fecha de alta «${fechaAlta}». Usá 31/12/2026 o 2026-12-31.`);

    const nacimiento = valorDe(fila, 'fechaNacimiento');
    const nacimientoISO = nacimiento ? fechaDeTexto(nacimiento) : null;
    if (nacimiento && !nacimientoISO) advertencias.push(`No se entiende la fecha de nacimiento «${nacimiento}»: se importa sin ella`);

    const estadoCivilTexto = valorDe(fila, 'estadoCivil');
    const estadoCivil = estadoCivilDeTexto(estadoCivilTexto);
    if (estadoCivil === undefined) advertencias.push(`No se entiende el estado civil «${estadoCivilTexto}»: se importa sin él`);

    const documentacion = {
      confirmado: casillero(valorDe(fila, 'confirmado'), 'confirmado', advertencias),
      fotocopiaDni: casillero(valorDe(fila, 'fotocopiaDni'), 'fotocopia del DNI', advertencias),
      actaMatrimonio: casillero(valorDe(fila, 'actaMatrimonio'), 'acta de matrimonio', advertencias),
    };

    const entrada: Record<string, unknown> = {
      numero: crudo.numero || null,
      apellido,
      nombre,
      dni: crudo.dni,
      cuit: valorDe(fila, 'cuit') || null,
      email: valorDe(fila, 'email') || null,
      telefono: valorDe(fila, 'telefono') || null,
      direccion: valorDe(fila, 'direccion') || null,
      observaciones: valorDe(fila, 'observaciones') || null,
      estadoCivil: estadoCivil ?? null,
      fechaNacimiento: nacimientoISO,
      ...(fechaAltaISO ? { fechaAlta: fechaAltaISO } : {}),
      ...documentacion,
      // Sin parcela el socio entra en lista de espera; con parcela, como titular.
      tipo: parcelas.length > 0 ? 'TITULAR' : 'SUPLENTE',
    };

    // Un dato opcional que no valida se descarta y se avisa; el resto de los errores bloquea.
    let parseada = socioCrearSchema.safeParse(entrada);
    while (!parseada.success) {
      const descartables = parseada.error.issues.filter((issue) => OPCIONALES.has(String(issue.path[0])));
      if (descartables.length === 0) break;
      for (const issue of descartables) {
        const campo = String(issue.path[0]) as ColumnaImportacion;
        // Un mismo campo puede fallar dos reglas: con avisar la primera alcanza.
        if (entrada[campo] === null) continue;
        advertencias.push(`${ETIQUETA_COLUMNA[campo]}: ${issue.message}. Se importa sin ese dato («${entrada[campo]}»)`);
        entrada[campo] = null;
      }
      parseada = socioCrearSchema.safeParse(entrada);
    }
    if (!parseada.success) {
      for (const issue of parseada.error.issues) {
        const columna = issue.path[0] as ColumnaImportacion | undefined;
        errores.push(columna && ETIQUETA_COLUMNA[columna] ? `${ETIQUETA_COLUMNA[columna]}: ${issue.message}` : issue.message);
      }
    }
    const socio = parseada.success ? parseada.data : null;

    registrarParcelas(parcelas, numeroDeFila, parcelasVistas, errores);

    // El mismo DNI más arriba es el mismo socio con otro lote: la fila se le suma.
    const principal = socio ? porDni.get(socio.dni) : undefined;
    if (socio && principal) {
      if (socio.numero !== null && principal.socio?.numero !== socio.numero) {
        errores.push(`El DNI ${socio.dni} ya aparece en la fila ${principal.fila} con otro número de socio`);
      }
      analizadas.push({
        fila: numeroDeFila,
        estado: errores.length ? 'error' : 'agrupada',
        errores,
        advertencias,
        agrupadaEn: principal.fila,
        socio,
        parcelas,
        crudo,
      });
      if (principal.socio && parcelas.length > 0) principal.socio.tipo = 'TITULAR';
      return;
    }

    if (socio) {
      if (socio.numero !== null) {
        const repetido = numerosVistos.get(String(socio.numero));
        if (repetido) errores.push(`El número de socio ${socio.numero} ya aparece en la fila ${repetido}`);
        else numerosVistos.set(String(socio.numero), numeroDeFila);
      }
      if (socio.cuit) {
        const repetido = cuitsVistos.get(socio.cuit);
        if (repetido) {
          advertencias.push(`El CUIT ${socio.cuit} ya aparece en la fila ${repetido} con otro DNI: se importa sin CUIT`);
          socio.cuit = null;
        } else cuitsVistos.set(socio.cuit, numeroDeFila);
      }
    }

    const analizada: FilaImportacion = {
      fila: numeroDeFila,
      estado: errores.length ? 'error' : 'nueva',
      errores,
      advertencias,
      socio,
      parcelas,
      crudo,
    };
    if (socio) porDni.set(socio.dni, analizada);
    analizadas.push(analizada);
  });

  return resumir(analizadas, faltantes);
}

/** Las parcelas de la fila: de «Manzana» + «Lote», o de la columna con los códigos. */
function leerParcelas(
  fila: string[],
  valorDe: (fila: string[], columna: ColumnaImportacion) => string,
  presentes: Set<ColumnaImportacion>,
  errores: string[],
  advertencias: string[],
): ParcelaImportada[] {
  const textoSuperficie = valorDe(fila, 'superficie');
  let superficieM2 = superficieDeTexto(textoSuperficie);
  if (superficieM2 === undefined) {
    advertencias.push(`No se entiende la superficie «${textoSuperficie}»: el lote queda sin m²`);
    superficieM2 = null;
  }

  if (presentes.has('manzana')) {
    const manzana = valorDe(fila, 'manzana');
    const lote = valorDe(fila, 'lote');
    if (!manzana && !lote) return [];
    if (!manzana || !lote) {
      errores.push(manzana ? `Falta el lote de la manzana ${manzana}` : `Falta la manzana del lote ${lote}`);
      return [];
    }
    return [{ codigo: `${manzana}-${lote}`, manzana, superficieM2 }];
  }

  const codigos = parcelasDeTexto(valorDe(fila, 'parcelas') || valorDe(fila, 'lote'));
  // Con varias parcelas en una celda no se sabe a cuál le corresponde la superficie.
  return codigos.map((codigo) => ({ codigo, manzana: null, superficieM2: codigos.length === 1 ? superficieM2 : null }));
}

function registrarParcelas(parcelas: ParcelaImportada[], fila: number, vistas: Map<string, number>, errores: string[]) {
  for (const { codigo } of parcelas) {
    const clave = normalizarEncabezado(codigo);
    const repetida = vistas.get(clave);
    if (repetida) errores.push(`La parcela ${codigo} ya aparece en la fila ${repetida}`);
    else vistas.set(clave, fila);
  }
}

function casillero(texto: string, cual: string, advertencias: string[]): boolean {
  const valor = siNoDeTexto(texto);
  if (valor === undefined) advertencias.push(`No se entiende «${texto}» en ${cual}: se toma como que no`);
  return valor ?? false;
}

/** Las parcelas que se le asignan al socio de una fila, contando las de sus filas agrupadas. */
export function parcelasDelSocio(principal: FilaImportacion, filas: FilaImportacion[]): ParcelaImportada[] {
  return [
    ...principal.parcelas,
    ...filas.filter((f) => f.estado === 'agrupada' && f.agrupadaEn === principal.fila).flatMap((f) => f.parcelas),
  ];
}

/** Recuenta los totales. La API la vuelve a llamar después de contrastar con la base. */
export function resumir(filas: FilaImportacion[], columnasFaltantes: ColumnaImportacion[] = []): ResultadoImportacion {
  const importables = filas.filter((f) => f.estado === 'nueva' || f.estado === 'agrupada');
  return {
    filas,
    total: filas.length,
    nuevos: filas.filter((f) => f.estado === 'nueva').length,
    omitidos: filas.filter((f) => f.estado === 'omitida').length,
    conError: filas.filter((f) => f.estado === 'error').length,
    conAdvertencias: filas.filter((f) => f.estado !== 'error' && f.estado !== 'omitida' && f.advertencias.length > 0).length,
    sinSocio: filas.filter((f) => f.estado === 'sinSocio').length,
    columnasFaltantes,
    asignaciones: importables.reduce((t, f) => t + f.parcelas.length, 0),
    parcelasNuevas: filas
      .filter((f) => f.estado === 'nueva' || f.estado === 'agrupada' || f.estado === 'sinSocio')
      .reduce((t, f) => t + f.parcelas.filter((p) => p.nueva).length, 0),
  };
}
