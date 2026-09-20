import { describe, expect, it } from 'vitest';
import { ETIQUETA_TIPO_SOCIO, TIPOS_SOCIO, hoy, primerPeriodoDelNuevoTitular, transferenciaCrearSchema } from './index';

describe('primerPeriodoDelNuevoTitular', () => {
  it('a mitad de mes, el período en curso queda con el titular saliente', () => {
    expect(primerPeriodoDelNuevoTitular('2026-09-16')).toBe('2026-10');
    expect(primerPeriodoDelNuevoTitular('2026-09-30')).toBe('2026-10');
  });

  it('el día 1 el período ya es del que entra', () => {
    expect(primerPeriodoDelNuevoTitular('2026-09-01')).toBe('2026-09');
  });

  it('cruza el año correctamente', () => {
    expect(primerPeriodoDelNuevoTitular('2026-12-15')).toBe('2027-01');
    expect(primerPeriodoDelNuevoTitular('2026-12-01')).toBe('2026-12');
  });
});

describe('transferenciaCrearSchema', () => {
  const base = { aSocioId: 3 };

  it('usa la fecha de hoy si no se indica', () => {
    expect(transferenciaCrearSchema.parse(base).fecha).toBe(hoy());
  });

  it('exige el socio que recibe la parcela', () => {
    expect(transferenciaCrearSchema.safeParse({}).success).toBe(false);
    expect(transferenciaCrearSchema.safeParse({ aSocioId: 0 }).success).toBe(false);
  });

  it('convierte un motivo vacío en null', () => {
    expect(transferenciaCrearSchema.parse({ ...base, motivo: '   ' }).motivo).toBeNull();
  });
});

describe('tipos de socio', () => {
  it('son titular y suplente, y cada uno tiene su etiqueta', () => {
    expect(TIPOS_SOCIO).toEqual(['TITULAR', 'SUPLENTE']);
    for (const t of TIPOS_SOCIO) expect(ETIQUETA_TIPO_SOCIO[t]).toBeTruthy();
  });
});
