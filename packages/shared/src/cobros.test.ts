import { describe, expect, it } from 'vitest';
import { cobroAnularSchema, cobroCrearSchema, hoy, numeroRecibo } from './index';

describe('numeroRecibo', () => {
  it('completa con ceros a la izquierda', () => {
    expect(numeroRecibo(1)).toBe('0000001');
    expect(numeroRecibo(12345)).toBe('0012345');
    expect(numeroRecibo(123456789)).toBe('123456789');
  });
});

describe('cobroCrearSchema', () => {
  const base = { socioId: 1, medio: 'EFECTIVO', cuotaIds: [10, 11] };

  it('usa la fecha de hoy si no se indica', () => {
    expect(cobroCrearSchema.parse(base).fecha).toBe(hoy());
  });

  it('exige al menos una cuota', () => {
    expect(cobroCrearSchema.safeParse({ ...base, cuotaIds: [] }).success).toBe(false);
  });

  it('rechaza medios de pago desconocidos', () => {
    expect(cobroCrearSchema.safeParse({ ...base, medio: 'CRIPTO' }).success).toBe(false);
  });

  it('convierte las observaciones vacías en null', () => {
    expect(cobroCrearSchema.parse({ ...base, observaciones: '   ' }).observaciones).toBeNull();
  });
});

describe('cobroAnularSchema', () => {
  it('exige un motivo con contenido', () => {
    expect(cobroAnularSchema.safeParse({ motivo: 'x' }).success).toBe(false);
    expect(cobroAnularSchema.parse({ motivo: '  cargado al socio equivocado  ' }).motivo).toBe(
      'cargado al socio equivocado',
    );
  });
});
