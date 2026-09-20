import { describe, expect, it } from 'vitest';
import { numeroPlan, planCrearSchema, repartir, simularPlan } from './index';

describe('repartir', () => {
  it('reparte en partes iguales cuando la división es exacta', () => {
    expect(repartir(4800000, 4)).toEqual([1200000, 1200000, 1200000, 1200000]);
  });

  it('da el resto a las primeras partes, sin perder ni un centavo', () => {
    const partes = repartir(1000, 3);
    expect(partes).toEqual([334, 333, 333]);
    expect(partes.reduce((t, p) => t + p, 0)).toBe(1000);
  });

  it('nunca pierde centavos, sea cual sea el reparto', () => {
    for (const total of [1, 99, 100_000, 3_333_333]) {
      for (const partes of [1, 2, 3, 7, 12, 60]) {
        expect(repartir(total, partes).reduce((t, p) => t + p, 0)).toBe(total);
      }
    }
  });
});

describe('simularPlan', () => {
  const base = { fecha: '2026-09-15', primerVencimiento: '2026-10-10' };

  it('refinancia una deuda en cuotas iguales', () => {
    const s = simularPlan({ ...base, deudaTotal: 4800000, anticipo: 0, cantidadCuotas: 4 });
    expect(s.cuotas).toEqual([
      { numero: 1, vencimiento: '2026-10-10', importe: 1200000 },
      { numero: 2, vencimiento: '2026-11-10', importe: 1200000 },
      { numero: 3, vencimiento: '2026-12-10', importe: 1200000 },
      { numero: 4, vencimiento: '2027-01-10', importe: 1200000 },
    ]);
    expect(s.importeCuota).toBe(1200000);
    expect(s.ultimoVencimiento).toBe('2027-01-10');
  });

  it('el total de las cuotas es siempre exactamente la deuda', () => {
    for (const cantidadCuotas of [1, 3, 7, 12]) {
      const s = simularPlan({ ...base, deudaTotal: 1000000, anticipo: 0, cantidadCuotas });
      expect(s.cuotas.reduce((t, c) => t + c.importe, 0)).toBe(1000000);
    }
  });

  it('el anticipo es la cuota 0 y vence el día de la firma', () => {
    const s = simularPlan({ ...base, deudaTotal: 4000000, anticipo: 10000, cantidadCuotas: 4 });
    expect(s.cuotas[0]).toEqual({ numero: 0, vencimiento: '2026-09-15', importe: 10000 });
    expect(s.financiado).toBe(3990000);
    expect(s.cuotas.reduce((t, c) => t + c.importe, 0)).toBe(4000000);
  });

  it('sin anticipo no agrega la cuota 0', () => {
    const s = simularPlan({ ...base, deudaTotal: 100000, anticipo: 0, cantidadCuotas: 2 });
    expect(s.cuotas.every((c) => c.numero !== 0)).toBe(true);
  });

  it('recorta el día de vencimiento en los meses más cortos', () => {
    const s = simularPlan({
      fecha: '2026-01-05',
      primerVencimiento: '2026-01-31',
      deudaTotal: 300000,
      anticipo: 0,
      cantidadCuotas: 3,
    });
    expect(s.cuotas.map((c) => c.vencimiento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('no cobra interés: el plan suma lo mismo que la deuda', () => {
    const s = simularPlan({ ...base, deudaTotal: 4800000, anticipo: 500000, cantidadCuotas: 6 });
    expect(s.cuotas.reduce((t, c) => t + c.importe, 0)).toBe(s.deudaTotal);
  });
});

describe('planCrearSchema', () => {
  const base = { socioId: 1, cuotaIds: [1, 2], cantidadCuotas: 4, primerVencimiento: '2026-10-10' };

  it('el anticipo vacío vale cero', () => {
    expect(planCrearSchema.parse(base).anticipo).toBe(0);
    expect(planCrearSchema.parse({ ...base, anticipo: '' }).anticipo).toBe(0);
    expect(planCrearSchema.parse({ ...base, anticipo: '1.500,50' }).anticipo).toBe(150050);
  });

  it('rechaza un primer vencimiento anterior a la fecha del plan', () => {
    const r = planCrearSchema.safeParse({ ...base, fecha: '2026-10-20' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['primerVencimiento']);
  });

  it('exige al menos una cuota a refinanciar y una cuota de plan', () => {
    expect(planCrearSchema.safeParse({ ...base, cuotaIds: [] }).success).toBe(false);
    expect(planCrearSchema.safeParse({ ...base, cantidadCuotas: 0 }).success).toBe(false);
    expect(planCrearSchema.safeParse({ ...base, cantidadCuotas: 61 }).success).toBe(false);
  });
});

describe('numeroPlan', () => {
  it('completa con ceros a la izquierda', () => {
    expect(numeroPlan(3)).toBe('00003');
    expect(numeroPlan(12345)).toBe('12345');
  });
});
