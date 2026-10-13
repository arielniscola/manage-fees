import { describe, expect, it } from 'vitest';
import { admiteMora, configuracionInteresSchema, moraSugerida, morasSchema, type ConfiguracionInteres } from './index';

const config = (extra: Partial<ConfiguracionInteres> = {}): ConfiguracionInteres => ({
  activo: true,
  porcentaje: 5,
  actualizadoEn: '2026-09-17T00:00:00.000Z',
  ...extra,
});

const cuota = (extra: Partial<{ importe: number; vencimiento: string; estado: string; origen: string }> = {}) => ({
  importe: 1_000_000,
  vencimiento: '2026-09-10',
  estado: 'PENDIENTE',
  origen: 'PARCELA',
  ...extra,
});

describe('admiteMora', () => {
  it('recién desde el día siguiente al vencimiento', () => {
    expect(admiteMora(cuota(), '2026-09-09')).toBe(false);
    // El día del vencimiento todavía se paga en término.
    expect(admiteMora(cuota(), '2026-09-10')).toBe(false);
    expect(admiteMora(cuota(), '2026-09-11')).toBe(true);
  });

  it('solo alcanza a las cuotas de parcela pendientes', () => {
    const hoy = '2026-11-10';
    expect(admiteMora(cuota({ estado: 'PAGADA' }), hoy)).toBe(false);
    expect(admiteMora(cuota({ estado: 'ANULADA' }), hoy)).toBe(false);
    expect(admiteMora(cuota({ estado: 'REFINANCIADA' }), hoy)).toBe(false);
    // La cuota social es un aporte fijo del socio: no se recarga por mora.
    expect(admiteMora(cuota({ origen: 'SOCIO' }), hoy)).toBe(false);
    // La deuda de un plan de pago ya se refinanció una vez: no lleva mora.
    expect(admiteMora(cuota({ origen: 'PLAN' }), hoy)).toBe(false);
    // El anticipo de entrada es un pago único por la asignación: tampoco.
    expect(admiteMora(cuota({ origen: 'ANTICIPO' }), hoy)).toBe(false);
  });
});

describe('moraSugerida', () => {
  it('propone el porcentaje sobre el importe apenas la cuota está vencida', () => {
    expect(moraSugerida(cuota(), config(), '2026-09-10')).toBe(0);
    expect(moraSugerida(cuota(), config(), '2026-09-11')).toBe(50_000);
  });

  it('es una sola vez, por más meses que pasen', () => {
    expect(moraSugerida(cuota(), config(), '2027-03-10')).toBe(50_000);
  });

  it('redondea al centavo', () => {
    expect(moraSugerida(cuota({ importe: 333 }), config({ porcentaje: 1.5 }), '2026-10-10')).toBe(5);
  });

  it('no propone nada si está desactivado o el porcentaje es cero', () => {
    const hoy = '2026-11-10';
    expect(moraSugerida(cuota(), config({ activo: false }), hoy)).toBe(0);
    expect(moraSugerida(cuota(), config({ porcentaje: 0 }), hoy)).toBe(0);
    expect(moraSugerida(cuota(), null, hoy)).toBe(0);
  });

  it('no propone nada para las cuotas que no admiten mora', () => {
    expect(moraSugerida(cuota({ origen: 'SOCIO' }), config(), '2026-11-10')).toBe(0);
    expect(moraSugerida(cuota({ estado: 'PAGADA' }), config(), '2026-11-10')).toBe(0);
  });
});

describe('morasSchema', () => {
  it('sin moras es una lista vacía', () => {
    expect(morasSchema.parse(undefined)).toEqual([]);
  });

  it('acepta importes en centavos, enteros y positivos', () => {
    expect(morasSchema.parse([{ cuotaId: 7, importe: 50_000 }])).toEqual([{ cuotaId: 7, importe: 50_000 }]);
    expect(morasSchema.safeParse([{ cuotaId: 7, importe: 0 }]).success).toBe(false);
    expect(morasSchema.safeParse([{ cuotaId: 7, importe: -100 }]).success).toBe(false);
    expect(morasSchema.safeParse([{ cuotaId: 7, importe: 10.5 }]).success).toBe(false);
  });

  it('rechaza dos moras para la misma cuota', () => {
    expect(morasSchema.safeParse([{ cuotaId: 7, importe: 100 }, { cuotaId: 7, importe: 200 }]).success).toBe(false);
  });
});

describe('configuracionInteresSchema', () => {
  it('acepta el porcentaje con coma y con punto', () => {
    expect(configuracionInteresSchema.parse({ activo: true, porcentaje: '1,5' })).toEqual({ activo: true, porcentaje: 1.5 });
  });

  it('rechaza porcentajes imposibles', () => {
    const base = { activo: true };
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: -1 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: 101 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: 1.555 }).success).toBe(false);
  });
});
