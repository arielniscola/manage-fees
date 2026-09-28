import { Injectable } from '@nestjs/common';
import {
  analizarFilasParcelas,
  normalizarNumero,
  resumirParcelas,
  type FilaImportacionParcela,
  type ResultadoImportacionParcelas,
} from '@mf/shared';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { leerPlanilla, type ArchivoSubido } from '../common/planilla';
import { PrismaService } from '../prisma/prisma.module';

/** Tope defensivo, igual que en el padrón. */
const MAX_FILAS = 5000;

interface LoteExistente {
  id: number;
  superficieM2: number | null;
}

/**
 * Importación de manzanas y lotes de un loteo desde una planilla, sin socios. Dos pasos
 * sobre el mismo archivo, como el padrón: la previsualización dice qué pasa con cada fila
 * y la importación lo aplica en una sola transacción, todo o nada.
 *
 * Lo que no existe se crea; de lo que ya existe solo se actualiza la superficie, y solo si
 * el archivo trae una distinta. Nunca se borra nada ni se tocan las asignaciones.
 */
@Injectable()
export class ImportacionParcelasService {
  constructor(private readonly prisma: PrismaService) {}

  async previsualizar(archivo: ArchivoSubido, loteoId: number): Promise<ResultadoImportacionParcelas> {
    return (await this.analizar(archivo, loteoId)).resultado;
  }

  async importar(archivo: ArchivoSubido, loteoId: number): Promise<ResultadoImportacionParcelas> {
    const { resultado, lotes } = await this.analizar(archivo, loteoId);

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
    if (resultado.nuevas === 0 && resultado.actualizadas === 0) {
      throw conflicto('No hay nada para importar: todos los lotes del archivo ya existen con la misma superficie.', 'archivo');
    }

    await this.prisma.$transaction(async (tx) => {
      const sectores = new Map(
        (await tx.sector.findMany({ where: { loteoId }, select: { id: true, nombre: true } })).map((s) => [
          normalizarNumero(s.nombre),
          s.id,
        ]),
      );

      for (const fila of resultado.filas) {
        if (fila.estado === 'actualiza') {
          const existente = lotes.get(fila)!;
          await tx.parcela.update({ where: { id: existente.id }, data: { superficieM2: fila.superficieM2 } });
          continue;
        }
        if (fila.estado !== 'nueva') continue;

        const claveSector = normalizarNumero(fila.manzana);
        let sectorId = sectores.get(claveSector);
        if (sectorId === undefined) {
          sectorId = (await tx.sector.create({ data: { nombre: fila.manzana, loteoId }, select: { id: true } })).id;
          sectores.set(claveSector, sectorId);
        }
        await tx.parcela.create({
          data: { codigo: fila.codigo, sectorId, superficieM2: fila.superficieM2, descripcion: fila.descripcion },
        });
      }
    });

    return resultado;
  }

  private async analizar(archivo: ArchivoSubido, loteoId: number) {
    const { encabezados, filas } = await leerPlanilla(archivo, MAX_FILAS);
    const analisis = analizarFilasParcelas(encabezados, filas);
    /** Qué lote de la base le corresponde a cada fila que ya existe. */
    const lotes = new Map<FilaImportacionParcela, LoteExistente>();
    if (analisis.columnasFaltantes.length > 0) return { resultado: analisis, lotes };

    const loteo = await this.prisma.loteo.findUnique({
      where: { id: loteoId },
      select: { sectores: { select: { nombre: true, parcelas: { select: { id: true, codigo: true, superficieM2: true } } } } },
    });
    if (!loteo) throw noEncontrado('El loteo elegido no existe');

    const manzanas = new Map(
      loteo.sectores.map((s) => [
        normalizarNumero(s.nombre),
        s.parcelas.map((p) => ({
          codigo: p.codigo,
          lote: { id: p.id, superficieM2: p.superficieM2 === null ? null : Number(p.superficieM2) },
        })),
      ]),
    );

    const finales = analisis.filas.map((f): FilaImportacionParcela => {
      if (f.estado !== 'nueva') return f;
      const parcelas = manzanas.get(normalizarNumero(f.manzana));
      if (!parcelas) return { ...f, manzanaNueva: true };

      const encontrada = parcelas.find((p) => esElLote(p.codigo, f.manzana, f.lote));
      if (!encontrada) return f;

      const actual = encontrada.lote.superficieM2;
      const cambia = f.superficieM2 !== null && f.superficieM2 !== actual;
      const fila: FilaImportacionParcela = cambia
        ? { ...f, estado: 'actualiza', superficieAnterior: actual }
        : { ...f, estado: 'sinCambios' };
      lotes.set(fila, encontrada.lote);
      return fila;
    });

    return { resultado: resumirParcelas(finales, analisis.columnasFaltantes), lotes };
  }
}

/**
 * Si el código de una parcela de la manzana es el lote de la fila. En el loteo el lote puede
 * estar cargado con el código completo, «7-1», o solo «1». Manzana y lote se comparan por
 * separado: pegados, «7-1» y el lote «71» serían lo mismo.
 */
function esElLote(codigo: string, manzana: string, lote: string): boolean {
  const buscado = normalizarNumero(lote);
  if (normalizarNumero(codigo) === buscado && !/[-\s/]/.test(codigo.trim())) return true;
  const partes = codigo.trim().split(/\s*[-/]\s*|\s+/);
  return partes.length === 2 && normalizarNumero(partes[0]) === normalizarNumero(manzana) && normalizarNumero(partes[1]) === buscado;
}
