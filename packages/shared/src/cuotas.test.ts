import { describe, expect, it } from 'vitest';
import {
  aCentavos,
  conceptoCuota,
  estadoVisible,
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  importeSchema,
  inicioPeriodo,
  mesesEntre,
  pesos,
  sumarMeses,
  tarifaCrearSchema,
  ultimoDia,
  vencimientoDe,
} from './index';

describe('importes en centavos', () => {
  it('interpreta el formato local, con puntos de miles y coma decimal', () => {
    expect(aCentavos('1.500,50')).toBe(150050);
    expect(aCentavos('1500,5')).toBe(150050);
    expect(aCentavos('$ 12.000')).toBe(1200000);
  });

  it('acepta también punto decimal y números', () => {
    expect(aCentavos('1500.50')).toBe(150050);
    expect(aCentavos(1500.5)).toBe(150050);
  });

  it('trata un punto con tres dígitos atrás como separador de miles', () => {
    expect(aCentavos('12.000')).toBe(1200000);
    expect(aCentavos('12.00')).toBe(1200);
  });

  it('devuelve null cuando no se puede interpretar', () => {
    expect(aCentavos('mil quinientos')).toBeNull();
    expect(aCentavos('')).toBeNull();
  });

  it('formatea de vuelta a pesos', () => {
    expect(pesos(150050)).toBe('$ 1.500,50');
  });

  /**
   * Trampa conocida: convertir dos veces multiplica por cien. Los formularios mandan al
   * servidor lo que está escrito, no lo que devuelve el resolver de zod, porque el
   * servidor vuelve a aplicar el mismo esquema.
   */
  it('convertir a centavos no es idempotente', () => {
    expect(importeSchema.parse('10.000')).toBe(1000000);
    expect(importeSchema.parse(1000000)).toBe(100000000);
  });

  it('el esquema rechaza importes vacíos, cero o negativos', () => {
    expect(importeSchema.safeParse('0').success).toBe(false);
    expect(importeSchema.safeParse('-100').success).toBe(false);
    expect(importeSchema.safeParse('abc').success).toBe(false);
    expect(importeSchema.parse('1.500,50')).toBe(150050);
  });
});

describe('aritmética de períodos', () => {
  it('suma y resta meses cruzando el año', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02');
    expect(sumarMeses('2026-02', -3)).toBe('2025-11');
    expect(mesesEntre('2026-11', '2027-02')).toBe(3);
  });

  it('alinea el período al año según la periodicidad', () => {
    expect(inicioPeriodo('2026-09-14', 'MENSUAL')).toBe('2026-09');
    expect(inicioPeriodo('2026-09-14', 'BIMESTRAL')).toBe('2026-09');
    expect(inicioPeriodo('2026-10-01', 'BIMESTRAL')).toBe('2026-09');
    expect(inicioPeriodo('2026-09-14', 'TRIMESTRAL')).toBe('2026-07');
    expect(inicioPeriodo('2026-09-14', 'SEMESTRAL')).toBe('2026-07');
    expect(inicioPeriodo('2026-09-14', 'ANUAL')).toBe('2026-01');
  });

  it('calcula el último día del período, incluso en años bisiestos', () => {
    expect(ultimoDia('2026-09', 'MENSUAL')).toBe('2026-09-30');
    expect(ultimoDia('2026-09', 'BIMESTRAL')).toBe('2026-10-31');
    expect(ultimoDia('2026-01', 'ANUAL')).toBe('2026-12-31');
    expect(ultimoDia('2024-02', 'MENSUAL')).toBe('2024-02-29');
    expect(ultimoDia('2026-02', 'MENSUAL')).toBe('2026-02-28');
  });

  it('recorta el día de vencimiento al último día del mes', () => {
    expect(vencimientoDe('2026-09', 10)).toBe('2026-09-10');
    expect(vencimientoDe('2026-02', 31)).toBe('2026-02-28');
    expect(vencimientoDe('2026-09', 31)).toBe('2026-09-30');
  });

  it('arma etiquetas legibles', () => {
    expect(etiquetaPeriodo('2026-09', 'MENSUAL')).toBe('septiembre 2026');
    expect(etiquetaPeriodo('2026-09', 'BIMESTRAL')).toBe('septiembre–octubre 2026');
    expect(etiquetaPeriodo('2026-11', 'SEMESTRAL')).toBe('noviembre 2026 – abril 2027');
    expect(etiquetaPeriodo('2026-01', 'ANUAL')).toBe('Año 2026');
    expect(etiquetaPeriodoCorta('2026-09', 'BIMESTRAL')).toBe('sep–oct 2026');
  });
});

describe('estado de una cuota', () => {
  it('marca vencida una cuota pendiente cuyo vencimiento ya pasó', () => {
    expect(estadoVisible('PENDIENTE', '2026-09-10', '2026-09-15')).toBe('vencida');
    expect(estadoVisible('PENDIENTE', '2026-09-10', '2026-09-10')).toBe('pendiente');
    expect(estadoVisible('PENDIENTE', '2026-10-10', '2026-09-15')).toBe('pendiente');
  });

  it('pagada y anulada no dependen de la fecha', () => {
    expect(estadoVisible('PAGADA', '2020-01-10', '2026-09-15')).toBe('pagada');
    expect(estadoVisible('ANULADA', '2020-01-10', '2026-09-15')).toBe('anulada');
  });
});

describe('tarifaCrearSchema', () => {
  it('guarda el importe en centavos y aplica los valores por defecto', () => {
    const t = tarifaCrearSchema.parse({ importe: '12.000', vigenteDesde: '2026-10' });
    // Sin alcance se asume la cuota por parcela, que es la que ya existía.
    expect(t).toEqual({ alcance: 'PARCELA', importe: 1200000, periodicidad: 'MENSUAL', diaVencimiento: 10, vigenteDesde: '2026-10' });
  });

  it('acepta las dos cuotas y rechaza cualquier otro alcance', () => {
    expect(tarifaCrearSchema.parse({ importe: '8.000', alcance: 'SOCIO', vigenteDesde: '2026-10' }).alcance).toBe('SOCIO');
    expect(tarifaCrearSchema.safeParse({ importe: '8.000', alcance: 'LOTEO', vigenteDesde: '2026-10' }).success).toBe(false);
  });

  it('exige un mes válido y un día de vencimiento entre 1 y 31', () => {
    expect(tarifaCrearSchema.safeParse({ importe: '100', vigenteDesde: '2026-13' }).success).toBe(false);
    expect(tarifaCrearSchema.safeParse({ importe: '100', vigenteDesde: '2026-10-01' }).success).toBe(false);
    expect(tarifaCrearSchema.safeParse({ importe: '100', diaVencimiento: 32 }).success).toBe(false);
    expect(tarifaCrearSchema.safeParse({ importe: '100', diaVencimiento: 0 }).success).toBe(false);
  });
});

describe('conceptoCuota', () => {
  const base = { periodo: '2026-09', periodicidad: 'MENSUAL' as const, plan: null };

  it('nombra la cuota social, que no cuelga de ninguna parcela', () => {
    expect(conceptoCuota({ ...base, origen: 'SOCIO' })).toBe('Cuota social septiembre 2026');
  });

  it('la de parcela es el período pelado: la parcela va en su propia columna', () => {
    expect(conceptoCuota({ ...base, origen: 'PARCELA' })).toBe('septiembre 2026');
  });

  it('la de un plan dice qué cuota del plan es', () => {
    const plan = { id: 1, numero: 7, cuotaNumero: 2, cantidadCuotas: 6 };
    expect(conceptoCuota({ ...base, origen: 'PLAN', plan })).toBe('Cuota 2 de 6 del plan 00007');
    expect(conceptoCuota({ ...base, origen: 'PLAN', plan: { ...plan, cuotaNumero: 0 } })).toBe('Anticipo del plan 00007');
  });
});
