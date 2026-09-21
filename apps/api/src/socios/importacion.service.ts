import { Injectable } from '@nestjs/common';
import {
  analizarFilas,
  etiquetaParcela,
  normalizarEncabezado,
  parcelasDelSocio,
  resumir,
  type FilaImportacion,
  type ParcelaImportada,
  type ResultadoImportacion,
} from '@mf/shared';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha } from '../common/fechas';
import { leerPlanilla, type ArchivoSubido } from '../common/planilla';
import { PrismaService } from '../prisma/prisma.module';

export type { ArchivoSubido };

/** Tope defensivo: un padrón de club no llega ni cerca y evita comerse la memoria. */
const MAX_FILAS = 5000;

/** Una parcela que ya está en la base. */
interface ParcelaExistente {
  id: number;
  ocupada: boolean;
  titular: string;
}

/**
 * Dónde cae cada parcela de la planilla: una que existe, una que se puede crear (hay
 * loteo y manzana) o un error que explica por qué no se puede usar.
 */
type Ubicacion = { existente: ParcelaExistente } | { crear: true } | { error: string };

/**
 * Importación del padrón desde una planilla. Son dos pasos sobre el mismo archivo: la
 * previsualización dice qué va a pasar con cada fila, y la importación lo aplica en una
 * sola transacción. Si al confirmar quedó alguna fila con error, no se importa nada.
 *
 * Con un loteo elegido, las manzanas y los lotes que la planilla nombra y todavía no
 * existen se crean en ese loteo. Sin loteo, las parcelas tienen que estar cargadas.
 *
 * El análisis de cada fila vive en `@mf/shared`; acá se resuelve lo que necesita la base:
 * si el socio ya existe, si el número está libre y si las parcelas se pueden asignar.
 */
@Injectable()
export class ImportacionService {
  constructor(private readonly prisma: PrismaService) {}

  async previsualizar(archivo: ArchivoSubido, loteoId?: number): Promise<ResultadoImportacion> {
    return (await this.analizar(archivo, loteoId)).resultado;
  }

  /**
   * Crea las parcelas que faltan, da de alta las filas nuevas y les asigna sus parcelas.
   * Se vuelve a analizar el archivo entero: entre la previsualización y la confirmación
   * pudo cambiar cualquier cosa, y el que manda es el estado de la base al importar.
   */
  async importar(archivo: ArchivoSubido, loteoId?: number): Promise<ResultadoImportacion> {
    const { resultado, ubicar } = await this.analizar(archivo, loteoId);

    if (resultado.columnasFaltantes.length > 0) {
      throw reglaIncumplida(`Al archivo le faltan columnas: ${resultado.columnasFaltantes.join(', ')}`, 'archivo');
    }
    if (resultado.conError > 0) {
      throw conflicto(
        `El archivo tiene ${resultado.conError === 1 ? 'una fila con error' : `${resultado.conError} filas con error`}. ` +
          'Corregilas y volvé a subirlo: la importación es todo o nada.',
        'archivo',
      );
    }
    if (resultado.nuevos === 0 && resultado.parcelasNuevas === 0) {
      throw conflicto('No hay nada nuevo para importar: todos los socios y lotes del archivo ya existen.', 'archivo');
    }

    const filas = resultado.filas;
    const nuevas = filas.filter((f) => f.estado === 'nueva');

    await this.prisma.$transaction(async (tx) => {
      // Primero las parcelas que faltan, con su manzana si tampoco existe.
      const creadas = new Map<string, number>();
      const sectores = new Map<string, number>();
      if (loteoId !== undefined) {
        const existentes = await tx.sector.findMany({ where: { loteoId }, select: { id: true, nombre: true } });
        for (const s of existentes) sectores.set(normalizarEncabezado(s.nombre), s.id);

        for (const fila of filas) {
          if (fila.estado !== 'nueva' && fila.estado !== 'agrupada' && fila.estado !== 'sinSocio') continue;
          for (const p of fila.parcelas) {
            if (!p.nueva || !p.manzana || creadas.has(claveParcela(p))) continue;
            const claveSector = normalizarEncabezado(p.manzana);
            let sectorId = sectores.get(claveSector);
            if (sectorId === undefined) {
              sectorId = (await tx.sector.create({ data: { nombre: p.manzana, loteoId }, select: { id: true } })).id;
              sectores.set(claveSector, sectorId);
            }
            const parcela = await tx.parcela.create({
              data: { codigo: p.codigo, sectorId, superficieM2: p.superficieM2 },
              select: { id: true },
            });
            creadas.set(claveParcela(p), parcela.id);
          }
        }
      }

      // Los números libres se reservan de una sola vez: dentro de la transacción nadie más
      // puede tomarlos, y así no hay que consultar el máximo fila por fila.
      const { _max } = await tx.socio.aggregate({ _max: { numero: true } });
      let siguiente = (_max.numero ?? 0) + 1;
      const tomados = new Set(nuevas.flatMap((f) => (f.socio?.numero ? [f.socio.numero] : [])));

      for (const fila of nuevas) {
        const datos = fila.socio!;
        let numero = datos.numero;
        if (numero === null) {
          while (tomados.has(siguiente)) siguiente++;
          numero = siguiente;
          tomados.add(numero);
        }

        const socio = await tx.socio.create({
          data: {
            numero,
            tipo: datos.tipo,
            nombre: datos.nombre,
            apellido: datos.apellido,
            dni: datos.dni,
            cuit: datos.cuit,
            email: datos.email,
            telefono: datos.telefono,
            direccion: datos.direccion,
            observaciones: datos.observaciones,
            estadoCivil: datos.estadoCivil,
            fechaNacimiento: datos.fechaNacimiento ? aFecha(datos.fechaNacimiento) : null,
            fechaAlta: aFecha(datos.fechaAlta),
            confirmado: datos.confirmado,
            fotocopiaDni: datos.fotocopiaDni,
            actaMatrimonio: datos.actaMatrimonio,
          },
        });

        for (const p of parcelasDelSocio(fila, filas)) {
          const ubicacion = ubicar(p);
          const parcelaId = 'existente' in ubicacion ? ubicacion.existente.id : creadas.get(claveParcela(p));
          // La previsualización ya se aseguró de que exista o se haya creado, y esté libre.
          if (!parcelaId) throw conflicto(`La parcela ${p.codigo} de la fila ${fila.fila} ya no está disponible`, 'archivo');
          await tx.asignacion.create({
            data: { socioId: socio.id, parcelaId, desde: aFecha(datos.fechaAlta) },
          });
        }
      }
    });

    return resultado;
  }

  private async analizar(archivo: ArchivoSubido, loteoId?: number) {
    const { encabezados, filas } = await leerPlanilla(archivo, MAX_FILAS);
    const analisis = analizarFilas(encabezados, filas);
    const ubicar = await this.ubicador(loteoId);
    if (analisis.columnasFaltantes.length > 0) return { resultado: analisis, ubicar };
    return { resultado: await this.contrastarConLaBase(analisis, ubicar, loteoId !== undefined), ubicar };
  }

  // ---------------------------------------------------------------- Contra la base

  private async contrastarConLaBase(
    analisis: ResultadoImportacion,
    ubicar: (p: ParcelaImportada) => Ubicacion,
    hayLoteo: boolean,
  ): Promise<ResultadoImportacion> {
    const principales = analisis.filas.filter((f) => f.socio && f.estado !== 'agrupada');
    const dnis = principales.map((f) => f.socio!.dni);
    const numeros = principales.flatMap((f) => (f.socio?.numero ? [f.socio.numero] : []));
    const cuits = principales.flatMap((f) => (f.socio?.cuit ? [f.socio.cuit] : []));

    const [existentes, conNumero, conCuit] = await Promise.all([
      this.prisma.socio.findMany({ where: { dni: { in: dnis } }, select: { dni: true, numero: true, apellido: true, nombre: true } }),
      this.prisma.socio.findMany({ where: { numero: { in: numeros } }, select: { numero: true, dni: true } }),
      this.prisma.socio.findMany({ where: { cuit: { in: cuits } }, select: { cuit: true, dni: true } }),
    ]);

    const porDni = new Map(existentes.map((s) => [s.dni, s]));
    const numerosTomados = new Map(conNumero.map((s) => [s.numero, s.dni]));
    const cuitsTomados = new Map(conCuit.map((s) => [s.cuit, s.dni]));

    /** Las parcelas de la fila, marcando las que se crean; anota por qué no sirven las demás. */
    const revisarParcelas = (f: FilaImportacion, errores: string[]): ParcelaImportada[] =>
      f.parcelas.map((p) => {
        const ubicacion = ubicar(p);
        if ('error' in ubicacion) errores.push(ubicacion.error);
        else if ('crear' in ubicacion) return { ...p, nueva: true };
        else if (ubicacion.existente.ocupada) errores.push(`La parcela ${p.codigo} ya está asignada a ${ubicacion.existente.titular}`);
        return p;
      });

    const filas: FilaImportacion[] = analisis.filas.map((f) => {
      if (f.estado === 'sinSocio') {
        const ubicaciones = f.parcelas.map(ubicar);
        if (ubicaciones.every((u) => 'crear' in u)) return { ...f, parcelas: f.parcelas.map((p) => ({ ...p, nueva: true })) };
        return {
          ...f,
          estado: 'omitida' as const,
          motivoOmitida: ubicaciones.some((u) => 'existente' in u)
            ? 'Lote sin socio que ya está cargado: no se toca'
            : hayLoteo
              ? 'Lote sin socio y sin manzana: no se puede crear'
              : 'Lote sin socio: para crearlo, elegí el loteo',
        };
      }
      if (!f.socio) return f;

      // El socio que ya está cargado no se toca: la fila se omite y se informa.
      const existente = f.estado !== 'agrupada' ? porDni.get(f.socio.dni) : undefined;
      if (existente) {
        return {
          ...f,
          estado: 'omitida' as const,
          motivoOmitida: `Ya existe el socio N° ${existente.numero}, ${existente.apellido} ${existente.nombre}, con ese DNI`,
        };
      }

      const errores = [...f.errores];
      const advertencias = [...f.advertencias];
      let socio = f.socio;

      if (f.estado !== 'agrupada') {
        const dueñoDelNumero = socio.numero !== null ? numerosTomados.get(socio.numero) : undefined;
        if (dueñoDelNumero) errores.push(`El número de socio ${socio.numero} ya lo tiene otro socio (DNI ${dueñoDelNumero})`);

        const dueñoDelCuit = socio.cuit ? cuitsTomados.get(socio.cuit) : undefined;
        if (dueñoDelCuit) {
          advertencias.push(`El CUIT ${socio.cuit} ya lo tiene otro socio (DNI ${dueñoDelCuit}): se importa sin CUIT`);
          socio = { ...socio, cuit: null };
        }
      }

      const parcelas = revisarParcelas(f, errores);
      return { ...f, socio, parcelas, errores, advertencias, estado: errores.length ? ('error' as const) : f.estado };
    });

    // Si el socio de la fila principal ya existe, sus otros lotes tampoco se importan.
    const omitidas = new Set(filas.filter((f) => f.estado === 'omitida').map((f) => f.fila));
    const finales = filas.map((f) =>
      f.agrupadaEn !== undefined && omitidas.has(f.agrupadaEn)
        ? { ...f, estado: 'omitida' as const, errores: [], motivoOmitida: `Otro lote del socio de la fila ${f.agrupadaEn}, que ya existe` }
        : f,
    );

    return resumir(finales, analisis.columnasFaltantes);
  }

  /**
   * Arma la función que ubica cada parcela de la planilla. Con loteo se busca solo ahí,
   * por manzana y código, y lo que no existe se puede crear. Sin loteo se busca en todo el
   * sistema, por código o por «loteo · código», y lo que no existe es un error.
   */
  private async ubicador(loteoId?: number): Promise<(p: ParcelaImportada) => Ubicacion> {
    if (loteoId === undefined) {
      const [parcelas, ambiguos] = await Promise.all([this.parcelasPorCodigo(), this.codigosAmbiguos()]);
      return (p) => {
        const clave = normalizarEncabezado(p.codigo);
        if (ambiguos.has(clave)) return { error: `Hay más de una parcela ${p.codigo}: elegí el loteo antes de subir el archivo` };
        const existente = parcelas.get(clave);
        return existente ? { existente } : { error: `No existe la parcela ${p.codigo}. Elegí el loteo para que se cree al importar` };
      };
    }

    const loteo = await this.prisma.loteo.findUnique({
      where: { id: loteoId },
      select: {
        nombre: true,
        sectores: {
          select: {
            nombre: true,
            parcelas: {
              select: {
                id: true,
                codigo: true,
                asignaciones: { where: { hasta: null }, select: { socio: { select: { apellido: true, nombre: true } } }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!loteo) throw noEncontrado('El loteo elegido no existe');

    const todas = loteo.sectores.flatMap((s) =>
      s.parcelas.map((p) => ({
        manzana: normalizarEncabezado(s.nombre),
        codigo: normalizarEncabezado(p.codigo),
        existente: {
          id: p.id,
          ocupada: p.asignaciones.length > 0,
          titular: p.asignaciones[0] ? `${p.asignaciones[0].socio.apellido} ${p.asignaciones[0].socio.nombre}` : '',
        },
      })),
    );

    return (p) => {
      const codigo = normalizarEncabezado(p.codigo);
      if (p.manzana) {
        const manzana = normalizarEncabezado(p.manzana);
        // En el loteo el lote puede estar cargado con el código completo, «7-1», o solo «1».
        const lote = normalizarEncabezado(p.codigo.slice(p.manzana.length + 1));
        const encontrada = todas.find((t) => t.manzana === manzana && (t.codigo === codigo || t.codigo === lote));
        return encontrada ? { existente: encontrada.existente } : { crear: true };
      }
      const candidatas = todas.filter((t) => t.codigo === codigo);
      if (candidatas.length === 1) return { existente: candidatas[0].existente };
      if (candidatas.length > 1) return { error: `En ${loteo.nombre} hay más de una parcela ${p.codigo}: separá manzana y lote en dos columnas` };
      return { error: `No existe la parcela ${p.codigo} en ${loteo.nombre}. Para crearla, poné manzana y lote en dos columnas` };
    };
  }

  /**
   * Las parcelas por código y por «loteo · código», para poder escribirlas de las dos
   * formas. El código solo es único dentro del sector, así que las repetidas se resuelven
   * únicamente por la forma larga; `codigosAmbiguos` marca cuáles son.
   */
  private async parcelasPorCodigo() {
    const parcelas = await this.prisma.parcela.findMany({
      select: {
        id: true,
        codigo: true,
        sector: { select: { id: true, nombre: true, loteo: { select: { id: true, nombre: true } } } },
        asignaciones: {
          where: { hasta: null },
          select: { socio: { select: { apellido: true, nombre: true } } },
          take: 1,
        },
      },
    });

    const mapa = new Map<string, ParcelaExistente>();
    const vistos = new Set<string>();
    for (const p of parcelas) {
      const vigente = p.asignaciones[0];
      const dato = {
        id: p.id,
        ocupada: !!vigente,
        titular: vigente ? `${vigente.socio.apellido} ${vigente.socio.nombre}` : '',
      };
      mapa.set(normalizarEncabezado(etiquetaParcela(p)), dato);
      const corto = normalizarEncabezado(p.codigo);
      // Con el código pelado gana el primero, pero si se repite queda como ambiguo.
      if (vistos.has(corto)) mapa.delete(corto);
      else {
        mapa.set(corto, dato);
        vistos.add(corto);
      }
    }
    return mapa;
  }

  /** Códigos que existen en más de una parcela: escritos solos no alcanzan. */
  private async codigosAmbiguos(): Promise<Set<string>> {
    const repetidos = await this.prisma.parcela.groupBy({
      by: ['codigo'],
      _count: { _all: true },
      having: { codigo: { _count: { gt: 1 } } },
    });
    return new Set(repetidos.map((r) => normalizarEncabezado(r.codigo)));
  }

}

/** La misma parcela aunque aparezca en varias filas: por manzana y código. */
const claveParcela = (p: ParcelaImportada): string => `${normalizarEncabezado(p.manzana ?? '')}|${normalizarEncabezado(p.codigo)}`;
