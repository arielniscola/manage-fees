import { describe, expect, it } from 'vitest';
import { analizarFilasParcelas, claveLote, mapearColumnasParcelas } from './index';

describe('importación de parcelas', () => {
  it('lee la planilla del padrón e ignora las columnas del socio', () => {
    const mapa = mapearColumnasParcelas(['N°', 'Manzana/Sector', 'Lote', 'M2', 'Nombre y apellido', 'DNI']);
    expect([...mapa.entries()]).toEqual([
      [1, 'manzana'],
      [2, 'lote'],
      [3, 'superficie'],
    ]);
  });

  it('exige manzana y lote', () => {
    expect(analizarFilasParcelas(['lote', 'm2'], []).columnasFaltantes).toEqual(['manzana']);
  });

  it('arma el código, lee la superficie con coma y saltea las filas vacías', () => {
    const r = analizarFilasParcelas(['Manzana', 'Lote', 'M2'], [
      ['7', '1', '259,04'],
      ['', '', 'Total'],
      ['7', '2', ''],
    ]);
    expect(r.filas.map((f) => [f.fila, f.codigo, f.superficieM2, f.estado])).toEqual([
      [2, '7-1', 259.04, 'nueva'],
      [4, '7-2', null, 'nueva'],
    ]);
  });

  it('marca como error la fila con manzana sin lote', () => {
    const r = analizarFilasParcelas(['Manzana', 'Lote'], [['7', '']]);
    expect(r.conError).toBe(1);
    expect(r.filas[0].errores[0]).toMatch(/Falta el lote/);
  });

  it('omite el mismo lote repetido, y es error si la superficie no coincide', () => {
    const r = analizarFilasParcelas(['Manzana', 'Lote', 'M2'], [
      ['7', '1', '200'],
      ['07', '1', '200'],
      ['7', '1', '300'],
    ]);
    expect(r.filas.map((f) => f.estado)).toEqual(['nueva', 'repetida', 'error']);
    expect(r.filas[1].repetidaDe).toBe(2);
  });

  it('avisa la superficie que no entiende y crea el lote sin m²', () => {
    const r = analizarFilasParcelas(['Manzana', 'Lote', 'M2'], [['7', '1', 'ver plano']]);
    expect(r.filas[0].estado).toBe('nueva');
    expect(r.filas[0].superficieM2).toBeNull();
    expect(r.conAdvertencias).toBe(1);
  });

  it('no confunde la manzana 7 lote 1 con la manzana 71', () => {
    expect(claveLote('7', '1')).not.toBe(claveLote('71', ''));
    expect(claveLote('A', '01')).toBe(claveLote('a', '1'));
  });
});
