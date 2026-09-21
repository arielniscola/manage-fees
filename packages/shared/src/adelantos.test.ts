import { describe, expect, it } from 'vitest';
import {
  claveAdelanto,
  cobroCrearSchema,
  configuracionAdelantoSchema,
  descuentoDeAdelanto,
  mesesDeAdelanto,
  totalesDeAdelanto,
  type ConfiguracionAdelanto,
  type CuotaAdelantada,
} from './index';

const config = (extra: Partial<ConfiguracionAdelanto> = {}): ConfiguracionAdelanto => ({
  activo: true,
  mesesMaximos: 12,
  descuento: 10,
  minimoMeses: 6,
  actualizadoEn: '2026-09-21T00:00:00.000Z',
  ...extra,
});

describe('descuentoDeAdelanto', () => {
  it('descuenta el porcentaje sobre el importe de la cuota', () => {
    expect(descuentoDeAdelanto(1_000_000, config(), 6)).toBe(100_000);
  });

  it('no descuenta nada si se adelantan menos meses que el mínimo', () => {
    expect(descuentoDeAdelanto(1_000_000, config(), 5)).toBe(0);
  });

  it('no descuenta nada con el adelanto apagado, sin porcentaje o sin configuración', () => {
    expect(descuentoDeAdelanto(1_000_000, config({ activo: false }), 12)).toBe(0);
    expect(descuentoDeAdelanto(1_000_000, config({ descuento: 0 }), 12)).toBe(0);
    expect(descuentoDeAdelanto(1_000_000, null, 12)).toBe(0);
  });

  it('redondea al centavo', () => {
    // 12.345 al 2,5 % son 308,625 centavos.
    expect(descuentoDeAdelanto(12_345, config({ descuento: 2.5, minimoMeses: 1 }), 1)).toBe(309);
  });
});

describe('mesesDeAdelanto', () => {
  it('cuenta los meses desde el mes en curso hasta el último que se paga', () => {
    expect(mesesDeAdelanto('2026-09', '2027-09')).toBe(12);
    expect(mesesDeAdelanto('2026-12', '2027-01')).toBe(1);
    expect(mesesDeAdelanto('2026-09', '2026-09')).toBe(0);
  });
});

describe('configuracionAdelantoSchema', () => {
  const base = { activo: true, mesesMaximos: 12, descuento: '10', minimoMeses: 6 };

  it('acepta el porcentaje escrito con coma', () => {
    expect(configuracionAdelantoSchema.parse({ ...base, descuento: '7,5' }).descuento).toBe(7.5);
  });

  it('no deja pedir un mínimo mayor que el máximo que se puede adelantar', () => {
    const r = configuracionAdelantoSchema.safeParse({ ...base, mesesMaximos: 3, minimoMeses: 6 });
    expect(r.success).toBe(false);
  });

  it('no deja pasar el tope duro de meses', () => {
    expect(configuracionAdelantoSchema.safeParse({ ...base, mesesMaximos: 48 }).success).toBe(false);
  });
});

describe('cobroCrearSchema con adelanto', () => {
  const base = { socioId: 1, fecha: '2026-09-21', medio: 'EFECTIVO' as const };

  it('acepta un cobro sin cuotas tildadas si adelanta', () => {
    const r = cobroCrearSchema.safeParse({ ...base, cuotaIds: [], adelantarHasta: '2027-03' });
    expect(r.success).toBe(true);
  });

  it('rechaza un cobro sin cuotas ni adelanto', () => {
    const r = cobroCrearSchema.safeParse({ ...base, cuotaIds: [] });
    expect(r.success).toBe(false);
  });

  it('acepta las dos cosas juntas: deuda vieja y meses adelantados', () => {
    const r = cobroCrearSchema.safeParse({ ...base, cuotaIds: [7, 8], adelantarHasta: '2027-03' });
    expect(r.success && r.data.adelantarHasta).toBe('2027-03');
  });
});

const adelantada = (extra: Partial<CuotaAdelantada> & { periodo: string }): CuotaAdelantada => ({
  clave: claveAdelanto({ origen: extra.origen ?? 'PARCELA', parcela: extra.parcela ?? null, periodo: extra.periodo }),
  periodicidad: 'MENSUAL',
  etiqueta: extra.periodo,
  origen: 'PARCELA',
  parcela: null,
  vencimiento: `${extra.periodo}-10`,
  importe: 1_000_000,
  descuento: 100_000,
  ...extra,
});

describe('claveAdelanto', () => {
  it('nombra la cuota de parcela por su parcela y período', () => {
    expect(claveAdelanto({ origen: 'PARCELA', parcela: { id: 7 }, periodo: '2026-10' })).toBe('PARCELA|7|2026-10');
  });

  it('nombra la social solo por su período, porque no cuelga de ninguna parcela', () => {
    expect(claveAdelanto({ origen: 'SOCIO', parcela: null, periodo: '2026-10' })).toBe('SOCIO|2026-10');
  });

  it('distingue la social de la de parcela del mismo mes', () => {
    const social = claveAdelanto({ origen: 'SOCIO', parcela: null, periodo: '2026-10' });
    const parcela = claveAdelanto({ origen: 'PARCELA', parcela: { id: 1 }, periodo: '2026-10' });
    expect(social).not.toBe(parcela);
  });
});

describe('totalesDeAdelanto', () => {
  const cuotas = [
    adelantada({ periodo: '2026-10', parcela: { id: 7, codigo: '7', etiqueta: 'Mz 7 L 1', manzana: '7' } }),
    adelantada({ periodo: '2026-10', origen: 'SOCIO', importe: 400_000, descuento: 40_000 }),
    adelantada({ periodo: '2026-11', parcela: { id: 7, codigo: '7', etiqueta: 'Mz 7 L 1', manzana: '7' } }),
  ];

  it('suma todo cuando no se saca nada', () => {
    const t = totalesDeAdelanto(cuotas);
    expect(t.cantidad).toBe(3);
    expect(t.importe).toBe(2_400_000);
    expect(t.descuento).toBe(240_000);
    expect(t.total).toBe(2_160_000);
  });

  it('deja afuera el renglón sacado: la social de octubre', () => {
    const t = totalesDeAdelanto(cuotas, ['SOCIO|2026-10']);
    expect(t.cantidad).toBe(2);
    expect(t.cuotas.every((c) => c.origen === 'PARCELA')).toBe(true);
    expect(t.total).toBe(1_800_000);
  });

  it('sacando todo queda en cero', () => {
    const t = totalesDeAdelanto(cuotas, cuotas.map((c) => c.clave));
    expect(t.cantidad).toBe(0);
    expect(t.total).toBe(0);
  });
});

describe('cobroCrearSchema con renglones excluidos', () => {
  const base = { socioId: 1, fecha: '2026-09-21', medio: 'EFECTIVO' as const, cuotaIds: [] };

  it('acepta las claves de los renglones que quedan afuera', () => {
    const r = cobroCrearSchema.safeParse({ ...base, adelantarHasta: '2027-03', adelantarExcepto: ['SOCIO|2026-10'] });
    expect(r.success && r.data.adelantarExcepto).toEqual(['SOCIO|2026-10']);
  });

  it('sin excluidas queda una lista vacía', () => {
    const r = cobroCrearSchema.safeParse({ ...base, adelantarHasta: '2027-03' });
    expect(r.success && r.data.adelantarExcepto).toEqual([]);
  });
});
