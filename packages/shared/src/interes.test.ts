import { describe, expect, it } from 'vitest';
import { configuracionInteresSchema, interesDeCuota, vecesAplicado, type ConfiguracionInteres } from './index';

const config = (extra: Partial<ConfiguracionInteres> = {}): ConfiguracionInteres => ({
  activo: true,
  modo: 'MENSUAL',
  diaAplicacion: 10,
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

describe('vecesAplicado', () => {
  it('no cobra nada mientras la cuota no llegó al primer día de aplicación', () => {
    expect(vecesAplicado('2026-09-10', '2026-09-10', 10)).toBe(0);
    expect(vecesAplicado('2026-09-10', '2026-10-09', 10)).toBe(0);
  });

  it('suma una aplicación por cada día de aplicación que pasó', () => {
    expect(vecesAplicado('2026-09-10', '2026-10-10', 10)).toBe(1);
    expect(vecesAplicado('2026-09-10', '2026-11-09', 10)).toBe(1);
    expect(vecesAplicado('2026-09-10', '2026-11-10', 10)).toBe(2);
    expect(vecesAplicado('2026-09-10', '2027-03-10', 10)).toBe(6);
  });

  it('cuenta el día de aplicación del propio mes si el vencimiento fue antes', () => {
    expect(vecesAplicado('2026-09-05', '2026-09-10', 10)).toBe(1);
  });

  it('en un mes más corto el día 31 cae en el último día', () => {
    expect(vecesAplicado('2026-01-31', '2026-02-27', 31)).toBe(0);
    expect(vecesAplicado('2026-01-31', '2026-02-28', 31)).toBe(1);
  });
});

describe('interesDeCuota', () => {
  const hoy = '2026-11-10';

  it('aplica el porcentaje sobre el importe original, una vez por mes', () => {
    // Dos meses de mora al 5 % son 10 % del importe, no 10,25 %.
    expect(interesDeCuota(cuota(), config(), hoy)).toBe(100_000);
  });

  it('redondea al centavo', () => {
    expect(interesDeCuota(cuota({ importe: 333 }), config({ porcentaje: 1.5 }), '2026-10-10')).toBe(5);
  });

  it('no cobra interés si está desactivado o el porcentaje es cero', () => {
    expect(interesDeCuota(cuota(), config({ activo: false }), hoy)).toBe(0);
    expect(interesDeCuota(cuota(), config({ porcentaje: 0 }), hoy)).toBe(0);
    expect(interesDeCuota(cuota(), null, hoy)).toBe(0);
  });

  it('solo alcanza a las cuotas de parcela pendientes', () => {
    expect(interesDeCuota(cuota({ estado: 'PAGADA' }), config(), hoy)).toBe(0);
    expect(interesDeCuota(cuota({ estado: 'ANULADA' }), config(), hoy)).toBe(0);
    // La cuota social es un aporte fijo del socio: no se recarga por mora.
    expect(interesDeCuota(cuota({ origen: 'SOCIO' }), config(), hoy)).toBe(0);
    // La deuda de un plan de pago ya se refinanció una vez: no vuelve a devengar.
    expect(interesDeCuota(cuota({ origen: 'PLAN' }), config(), hoy)).toBe(0);
  });
});

describe('modo único', () => {
  it('aplica el recargo una sola vez, por más meses que pasen', () => {
    const unico = config({ modo: 'UNICO' });
    expect(interesDeCuota(cuota(), unico, '2026-10-09')).toBe(0);
    expect(interesDeCuota(cuota(), unico, '2026-10-10')).toBe(50_000);
    expect(interesDeCuota(cuota(), unico, '2027-03-10')).toBe(50_000);
    expect(interesDeCuota(cuota(), config(), '2027-03-10')).toBe(300_000);
  });
});

describe('configuracionInteresSchema', () => {
  it('acepta el porcentaje con coma y con punto', () => {
    expect(configuracionInteresSchema.parse({ activo: true, diaAplicacion: '10', porcentaje: '1,5' })).toEqual({
      activo: true,
      modo: 'MENSUAL',
      diaAplicacion: 10,
      porcentaje: 1.5,
    });
  });

  it('rechaza días fuera del mes y porcentajes imposibles', () => {
    const base = { activo: true, diaAplicacion: 10, porcentaje: 5 };
    expect(configuracionInteresSchema.safeParse({ ...base, diaAplicacion: 0 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, diaAplicacion: 32 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: -1 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: 101 }).success).toBe(false);
    expect(configuracionInteresSchema.safeParse({ ...base, porcentaje: 1.555 }).success).toBe(false);
  });
});
