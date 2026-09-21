import { describe, expect, it } from 'vitest';
import {
  analizarHistorial,
  columnasFaltantesHistorial,
  historialCrearSchema,
  pagadaDeTexto,
  periodoDeTexto,
  periodosEntre,
} from './index';

const ENCABEZADOS = ['DNI', 'Parcela', 'Período', 'Importe', 'Estado', 'Fecha de pago'];
const fila = (dni: string, parcela: string, periodo: string, importe: string, estado: string, pago = '') => [
  dni,
  parcela,
  periodo,
  importe,
  estado,
  pago,
];

describe('periodoDeTexto', () => {
  it('acepta las formas en que se escribe un mes', () => {
    expect(periodoDeTexto('2024-01')).toBe('2024-01');
    expect(periodoDeTexto('2024/1')).toBe('2024-01');
    expect(periodoDeTexto('01/2024')).toBe('2024-01');
    expect(periodoDeTexto('enero 2024')).toBe('2024-01');
    expect(periodoDeTexto('ene-24')).toBe('2024-01');
    expect(periodoDeTexto('Diciembre/2023')).toBe('2023-12');
  });

  it('de una fecha entera toma el mes', () => {
    expect(periodoDeTexto('15/03/2024')).toBe('2024-03');
  });

  it('descarta lo que no se entiende', () => {
    expect(periodoDeTexto('')).toBeNull();
    expect(periodoDeTexto('primer trimestre')).toBeNull();
    expect(periodoDeTexto('2024-13')).toBeNull();
  });
});

describe('pagadaDeTexto', () => {
  it('entiende las dos columnas de estado que usan los clubes', () => {
    expect(pagadaDeTexto('Pagada')).toBe(true);
    expect(pagadaDeTexto('SI')).toBe(true);
    expect(pagadaDeTexto('abonado')).toBe(true);
    expect(pagadaDeTexto('Adeudada')).toBe(false);
    expect(pagadaDeTexto('debe')).toBe(false);
    expect(pagadaDeTexto('impaga')).toBe(false);
    expect(pagadaDeTexto('más o menos')).toBeNull();
  });
});

describe('periodosEntre', () => {
  it('lista los meses de un tramo mensual', () => {
    expect(periodosEntre('2024-01', '2024-04', 'MENSUAL')).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
  });

  it('salta según la periodicidad y alinea al año', () => {
    expect(periodosEntre('2024-02', '2024-12', 'TRIMESTRAL')).toEqual(['2024-01', '2024-04', '2024-07', '2024-10']);
    expect(periodosEntre('2023-05', '2024-05', 'ANUAL')).toEqual(['2023-01', '2024-01']);
  });

  it('un tramo al revés no devuelve nada', () => {
    expect(periodosEntre('2024-06', '2024-01', 'MENSUAL')).toEqual([]);
  });
});

describe('columnasFaltantesHistorial', () => {
  it('el socio se puede identificar por DNI o por número', () => {
    expect(columnasFaltantesHistorial(new Set(['numero', 'periodo', 'importe', 'estado']))).toEqual([]);
    expect(columnasFaltantesHistorial(new Set(['dni', 'periodo', 'importe', 'estado']))).toEqual([]);
  });

  it('avisa las que no pueden faltar', () => {
    expect(columnasFaltantesHistorial(new Set(['dni']))).toEqual(['periodo', 'importe', 'estado']);
  });
});

describe('analizarHistorial', () => {
  it('interpreta una cuota de parcela y una social', () => {
    const r = analizarHistorial(ENCABEZADOS, [
      fila('28114502', '7-1', '2024-01', '12000', 'Pagada', '05/01/2024'),
      fila('28114502', '', '2024-01', '4000', 'Pagada'),
    ]);

    expect(r.nuevas).toBe(2);
    expect(r.conError).toBe(0);
    expect(r.filas[0].cuota).toMatchObject({
      origen: 'PARCELA',
      parcela: '7-1',
      periodo: '2024-01',
      importe: 1_200_000,
      pagada: true,
      fechaPago: '2024-01-05',
    });
    expect(r.filas[1].cuota).toMatchObject({ origen: 'SOCIO', parcela: null, importe: 400_000 });
  });

  it('separa los totales de lo pagado y lo adeudado', () => {
    const r = analizarHistorial(ENCABEZADOS, [
      fila('28114502', '7-1', '2024-01', '12000', 'Pagada'),
      fila('28114502', '7-1', '2024-02', '12000', 'Adeudada'),
      fila('30115003', '7-3', '2024-01', '10000', 'Adeudada'),
    ]);

    expect(r.pagadas).toBe(1);
    expect(r.importePagado).toBe(1_200_000);
    expect(r.adeudadas).toBe(2);
    expect(r.importeAdeudado).toBe(2_200_000);
    expect(r.socios).toBe(2);
  });

  it('marca la fila con error y no la cuenta como nueva', () => {
    const r = analizarHistorial(ENCABEZADOS, [
      fila('28114502', '7-1', 'cuando sea', '12000', 'Pagada'),
      fila('', '7-1', '2024-01', '12000', 'Pagada'),
      fila('28114502', '7-1', '2024-03', 'lo que salga', 'Pagada'),
      fila('28114502', '7-1', '2024-04', '12000', 'más o menos'),
    ]);

    expect(r.conError).toBe(4);
    expect(r.nuevas).toBe(0);
    expect(r.filas[0].errores[0]).toContain('período');
    expect(r.filas[1].errores[0]).toContain('DNI');
  });

  it('la misma cuota dos veces en el archivo entra una sola', () => {
    const r = analizarHistorial(ENCABEZADOS, [
      fila('28114502', '7-1', '2024-01', '12000', 'Pagada'),
      fila('28114502', '7-1', 'enero 2024', '12000', 'Pagada'),
    ]);

    expect(r.nuevas).toBe(1);
    expect(r.conError).toBe(1);
    expect(r.filas[1].errores[0]).toContain('fila 2');
  });

  it('la fecha de pago de una cuota adeudada se descarta con un aviso', () => {
    const r = analizarHistorial(ENCABEZADOS, [fila('28114502', '7-1', '2024-01', '12000', 'Adeudada', '05/01/2024')]);
    expect(r.filas[0].cuota?.fechaPago).toBeNull();
    expect(r.conAdvertencias).toBe(1);
  });

  it('sin las columnas obligatorias ni se analiza', () => {
    const r = analizarHistorial(['DNI', 'Parcela'], [['28114502', '7-1']]);
    expect(r.columnasFaltantes).toEqual(['periodo', 'importe', 'estado']);
    expect(r.filas).toEqual([]);
  });
});

describe('historialCrearSchema', () => {
  const base = { desde: '2024-01', hasta: '2024-12', importe: '12000' };

  it('la cuota social viaja con la parcela vacía', () => {
    const r = historialCrearSchema.safeParse({ ...base, parcelaId: '' });
    expect(r.success && r.data.parcelaId).toBeNull();
  });

  it('el radio «false» no se interpreta como pagada', () => {
    const r = historialCrearSchema.safeParse({ ...base, parcelaId: '3', pagada: 'false' });
    expect(r.success && r.data.pagada).toBe(false);
  });

  it('no acepta un tramo al revés', () => {
    const r = historialCrearSchema.safeParse({ ...base, desde: '2024-12', hasta: '2024-01', parcelaId: '' });
    expect(r.success).toBe(false);
  });

  it('no acepta un tramo interminable', () => {
    const r = historialCrearSchema.safeParse({ ...base, desde: '1990-01', hasta: '2024-12', parcelaId: '' });
    expect(r.success).toBe(false);
  });
});
