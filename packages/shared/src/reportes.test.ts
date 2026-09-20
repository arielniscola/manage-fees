import { describe, expect, it } from 'vitest';
import { TIPOS_REPORTE, USA_RANGO, DESCRIPCION_REPORTE, ETIQUETA_REPORTE, hoy, inicioDelMes, panelSchema, reporteSchema } from './index';

describe('inicioDelMes', () => {
  it('es el primer día del mes en curso', () => {
    expect(inicioDelMes()).toBe(`${hoy().slice(0, 7)}-01`);
    expect(inicioDelMes() <= hoy()).toBe(true);
  });
});

describe('panelSchema', () => {
  it('sin parámetros toma el mes en curso y doce meses de evolución', () => {
    const p = panelSchema.parse({});
    expect(p.desde).toBe(inicioDelMes());
    expect(p.hasta).toBe(hoy());
    expect(p.meses).toBe(12);
  });

  it('acota los meses del gráfico a un rango razonable', () => {
    expect(panelSchema.safeParse({ meses: 2 }).success).toBe(false);
    expect(panelSchema.safeParse({ meses: 25 }).success).toBe(false);
    expect(panelSchema.parse({ meses: 6 }).meses).toBe(6);
  });
});

describe('reporteSchema', () => {
  it('exporta en Excel si no se indica formato', () => {
    expect(reporteSchema.parse({}).formato).toBe('xlsx');
  });

  it('rechaza formatos desconocidos y fechas mal escritas', () => {
    expect(reporteSchema.safeParse({ formato: 'pdf' }).success).toBe(false);
    expect(reporteSchema.safeParse({ desde: '15/09/2026' }).success).toBe(false);
  });
});

describe('catálogo de reportes', () => {
  it('cada tipo tiene etiqueta, descripción y sabe si usa el rango', () => {
    for (const tipo of TIPOS_REPORTE) {
      expect(ETIQUETA_REPORTE[tipo]).toBeTruthy();
      expect(DESCRIPCION_REPORTE[tipo]).toBeTruthy();
      expect(typeof USA_RANGO[tipo]).toBe('boolean');
    }
  });

  it('el padrón y los morosos son una foto de hoy; cobros y planes usan el rango', () => {
    expect(USA_RANGO.socios).toBe(false);
    expect(USA_RANGO.morosos).toBe(false);
    expect(USA_RANGO.cobros).toBe(true);
    expect(USA_RANGO.planes).toBe(true);
  });
});
