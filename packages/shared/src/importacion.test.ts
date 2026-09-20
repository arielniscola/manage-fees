import { describe, expect, it } from 'vitest';
import {
  analizarFilas,
  estadoCivilDeTexto,
  fechaDeTexto,
  mapearColumnas,
  parcelasDeTexto,
  parcelasDelSocio,
  separarNombre,
  siNoDeTexto,
  superficieDeTexto,
} from './index';

const ENCABEZADOS = ['numero', 'apellido', 'nombre', 'dni', 'alta', 'parcelas'];
const fila = (...celdas: string[]) => celdas;

describe('encabezados', () => {
  it('reconoce los nombres con acentos, mayúsculas y signos', () => {
    const mapa = mapearColumnas(['N° Socio', 'Apellido', 'NOMBRE', 'D.N.I.', 'Fecha de Alta', 'Teléfono']);
    expect([...mapa.values()]).toEqual(['numero', 'apellido', 'nombre', 'dni', 'fechaAlta', 'telefono']);
  });

  it('avisa cuáles de las obligatorias faltan', () => {
    const { columnasFaltantes } = analizarFilas(['nombre', 'email'], []);
    expect(columnasFaltantes).toEqual(['nombreCompleto', 'dni']);
  });

  it('ignora las columnas que no conoce, en vez de romper', () => {
    const mapa = mapearColumnas(['apellido', 'color favorito', 'dni']);
    expect([...mapa.values()]).toEqual(['apellido', 'dni']);
  });
});

describe('fechas de la planilla', () => {
  it('acepta el formato local y el ISO', () => {
    expect(fechaDeTexto('02/03/1998')).toBe('1998-03-02');
    expect(fechaDeTexto('2-3-1998')).toBe('1998-03-02');
    expect(fechaDeTexto('1998-03-02')).toBe('1998-03-02');
  });

  it('rechaza fechas que no existen', () => {
    expect(fechaDeTexto('31/02/2026')).toBeNull();
    expect(fechaDeTexto('mañana')).toBeNull();
  });

  it('acepta la fecha pegada de una celda numérica y rechaza años de tres dígitos', () => {
    expect(fechaDeTexto('24012000')).toBe('2000-01-24');
    expect(fechaDeTexto('29148780')).toBeNull();
    expect(fechaDeTexto('14/12/0197')).toBeNull();
  });

  it('completa el año de dos dígitos hacia atrás cuando es futuro', () => {
    expect(fechaDeTexto('02/03/98')).toBe('1998-03-02');
    expect(fechaDeTexto('02/03/20')).toBe('2020-03-02');
  });
});

describe('celdas sueltas', () => {
  it('interpreta el estado civil escrito de cualquier forma', () => {
    expect(estadoCivilDeTexto('Casado/a')).toBe('CASADO');
    expect(estadoCivilDeTexto('CASADA')).toBe('CASADO');
    expect(estadoCivilDeTexto('')).toBeNull();
    expect(estadoCivilDeTexto('En concubinato')).toBe('CONCUBINATO');
    expect(estadoCivilDeTexto('en pareja')).toBeUndefined();
  });

  it('parte el nombre completo por la coma, y sin coma adivina y avisa', () => {
    expect(separarNombre('SOSA, VIVIANA BEATRIZ')).toEqual({ apellido: 'SOSA', nombre: 'VIVIANA BEATRIZ', adivinado: false });
    expect(separarNombre('Diaz  Ana Laura')).toEqual({ apellido: 'Diaz', nombre: 'Ana Laura', adivinado: true });
  });

  it('lee los casilleros y la superficie como los escribe el Excel', () => {
    expect(siNoDeTexto('true')).toBe(true);
    expect(siNoDeTexto('Sí')).toBe(true);
    expect(siNoDeTexto('')).toBe(false);
    expect(siNoDeTexto('quizás')).toBeUndefined();
    expect(superficieDeTexto('191,68')).toBe(191.68);
    expect(superficieDeTexto('259.04')).toBe(259.04);
    expect(superficieDeTexto('')).toBeNull();
    expect(superficieDeTexto('mucho')).toBeUndefined();
  });

  it('separa las parcelas por coma, punto y coma o barra', () => {
    expect(parcelasDeTexto('7-1, 7-2')).toEqual(['7-1', '7-2']);
    expect(parcelasDeTexto('7-1;7-2 | 8-3')).toEqual(['7-1', '7-2', '8-3']);
    expect(parcelasDeTexto('   ')).toEqual([]);
  });
});

describe('análisis de filas', () => {
  it('normaliza una fila buena y la deja lista para importar', () => {
    const r = analizarFilas(ENCABEZADOS, [fila('101', 'Ferreyra', 'Carlos', '28.114.502', '02/03/1998', '7-1, 7-2')]);
    expect(r.nuevos).toBe(1);
    expect(r.asignaciones).toBe(2);
    expect(r.filas[0].socio).toMatchObject({ numero: 101, dni: '28114502', fechaAlta: '1998-03-02', tipo: 'TITULAR' });
    expect(r.filas[0].parcelas.map((p) => p.codigo)).toEqual(['7-1', '7-2']);
  });

  it('el socio sin parcela entra como suplente', () => {
    const r = analizarFilas(ENCABEZADOS, [fila('103', 'Sosa', 'Julián', '38442960', '20/05/2019', '')]);
    expect(r.filas[0].socio?.tipo).toBe('SUPLENTE');
  });

  it('numera las filas como las ve el usuario en la planilla', () => {
    const r = analizarFilas(ENCABEZADOS, [
      fila('1', 'Uno', 'Uno', '10000001', '', ''),
      fila('2', 'Dos', 'Dos', '10000002', '', ''),
    ]);
    expect(r.filas.map((f) => f.fila)).toEqual([2, 3]);
  });

  it('marca los errores de la fila con el nombre de la columna', () => {
    const r = analizarFilas(ENCABEZADOS, [fila('101', '', 'Carlos', '4011a623', '31/02/2026', '')]);
    expect(r.conError).toBe(1);
    expect(r.filas[0].errores.join(' · ')).toContain('Apellido');
    expect(r.filas[0].errores.join(' · ')).toContain('DNI');
    expect(r.filas[0].errores.some((e) => e.includes('fecha de alta'))).toBe(true);
  });

  it('detecta los repetidos dentro del mismo archivo', () => {
    const r = analizarFilas(ENCABEZADOS, [
      fila('101', 'Ferreyra', 'Carlos', '28114502', '', '7-1'),
      fila('101', 'Acosta', 'Martín', '33905117', '', '7-1'),
    ]);
    const errores = r.filas[1].errores.join(' · ');
    expect(errores).toContain('El número de socio 101 ya aparece en la fila 2');
    expect(errores).toContain('La parcela 7-1 ya aparece en la fila 2');
  });

  it('un dato opcional inválido se descarta con un aviso en vez de bloquear', () => {
    const r = analizarFilas(['apellido', 'nombre', 'dni', 'cuit', 'fecha de nacimiento', 'estado civil'], [
      fila('Ferreyra', 'Carlos', '28114502', '2027402049', '17/051984', 'Barrio Centro'),
    ]);
    expect(r.filas[0].estado).toBe('nueva');
    expect(r.filas[0].socio).toMatchObject({ cuit: null, fechaNacimiento: null, estadoCivil: null });
    expect(r.filas[0].advertencias).toHaveLength(3);
  });
  it('cuenta el resumen de la planilla entera', () => {
    const r = analizarFilas(ENCABEZADOS, [
      fila('101', 'Ferreyra', 'Carlos', '28114502', '02/03/1998', '7-1, 7-2'),
      fila('102', 'Acosta', 'Martín', '33905117', '10/08/2015', '7-3'),
      fila('103', 'Sosa', 'Julián', 'no es un dni', '', ''),
    ]);
    expect(r).toMatchObject({ total: 3, nuevos: 2, conError: 1, omitidos: 0, asignaciones: 3 });
  });
});

describe('planilla con una fila por lote', () => {
  const ENCABEZADOS_LOTE = ['Nº', 'MANZANA/SECTOR', 'LOTE', 'M2', 'NOMBRE Y APELLIDO', 'DNI', 'CONFIRMACIÓN', 'FOTOC DNI'];

  it('reconoce los encabezados y no toma el correlativo como número de socio', () => {
    const mapa = mapearColumnas(ENCABEZADOS_LOTE);
    expect([...mapa.values()]).toEqual(['manzana', 'lote', 'superficie', 'nombreCompleto', 'dni', 'confirmado', 'fotocopiaDni']);
  });

  it('arma la parcela con manzana y lote, y junta los lotes del mismo DNI en un socio', () => {
    const r = analizarFilas(ENCABEZADOS_LOTE, [
      fila('1', '7', '1', '259,04', 'SOSA, VIVIANA BEATRIZ', '22358431', 'true', 'false'),
      fila('2', '7', '2', '', 'SOSA, VIVIANA BEATRIZ', '22358431', 'true', 'false'),
    ]);
    expect(r.filas[0]).toMatchObject({ estado: 'nueva', socio: { apellido: 'SOSA', nombre: 'VIVIANA BEATRIZ', confirmado: true } });
    expect(r.filas[0].parcelas).toEqual([{ codigo: '7-1', manzana: '7', superficieM2: 259.04 }]);
    expect(r.filas[1]).toMatchObject({ estado: 'agrupada', agrupadaEn: 2 });
    expect(parcelasDelSocio(r.filas[0], r.filas).map((p) => p.codigo)).toEqual(['7-1', '7-2']);
    expect(r).toMatchObject({ nuevos: 1, asignaciones: 2 });
  });

  it('una fila sin nombre ni DNI es un lote libre', () => {
    const r = analizarFilas(ENCABEZADOS_LOTE, [fila('8', '7', '8', '300', '', '', '', '')]);
    expect(r.filas[0]).toMatchObject({ estado: 'sinSocio', socio: null });
    expect(r).toMatchObject({ nuevos: 0, sinSocio: 1, conError: 0 });
  });
});
