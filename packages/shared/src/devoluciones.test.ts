import { describe, expect, it } from 'vitest';
import {
  devolucionAnularSchema,
  devolucionCrearSchema,
  devolucionListarSchema,
  hoy,
  motivoDevolucionActualizarSchema,
  motivoDevolucionSchema,
  numeroDevolucion,
  textoMotivoDevolucion,
} from './index';

describe('numeroDevolucion', () => {
  it('rellena con ceros a 7 dígitos', () => {
    expect(numeroDevolucion(1)).toBe('0000001');
    expect(numeroDevolucion(12345678)).toBe('12345678');
  });
});

describe('devolucionCrearSchema', () => {
  const valida = { medio: 'EFECTIVO', motivoId: 1, destinoCuotas: 'PENDIENTE' } as const;

  it('toma hoy como fecha por defecto', () => {
    expect(devolucionCrearSchema.parse(valida).fecha).toBe(hoy());
  });

  it('exige medio, motivo y qué pasa con las cuotas', () => {
    expect(devolucionCrearSchema.safeParse({ ...valida, medio: undefined }).success).toBe(false);
    expect(devolucionCrearSchema.safeParse({ ...valida, motivoId: undefined }).success).toBe(false);
    expect(devolucionCrearSchema.safeParse({ ...valida, motivoId: '' }).success).toBe(false);
    expect(devolucionCrearSchema.safeParse({ ...valida, destinoCuotas: undefined }).success).toBe(false);
    expect(devolucionCrearSchema.safeParse({ ...valida, destinoCuotas: 'REFINANCIADA' }).success).toBe(false);
  });

  it('el detalle es opcional y se recorta', () => {
    expect(devolucionCrearSchema.parse(valida).detalle).toBeUndefined();
    expect(devolucionCrearSchema.parse({ ...valida, detalle: '   ' }).detalle).toBeUndefined();
    expect(devolucionCrearSchema.parse({ ...valida, detalle: '  pagó enero dos veces  ' }).detalle).toBe('pagó enero dos veces');
  });
});

describe('motivos de devolución', () => {
  it('exige un nombre de 3 a 80 caracteres', () => {
    expect(motivoDevolucionSchema.safeParse({ nombre: ' x ' }).success).toBe(false);
    expect(motivoDevolucionSchema.parse({ nombre: '  Pago duplicado ' }).nombre).toBe('Pago duplicado');
  });

  it('se puede desactivar sin renombrar', () => {
    expect(motivoDevolucionActualizarSchema.parse({ activo: false })).toEqual({ activo: false });
  });

  it('arma el texto con el detalle, si lo hay', () => {
    expect(textoMotivoDevolucion('Pago duplicado')).toBe('Pago duplicado');
    expect(textoMotivoDevolucion('Pago duplicado', 'enero')).toBe('Pago duplicado: enero');
  });
});

describe('devolucionAnularSchema', () => {
  it('exige un motivo', () => {
    expect(devolucionAnularSchema.safeParse({ motivo: '' }).success).toBe(false);
    expect(devolucionAnularSchema.parse({ motivo: 'cargada sobre otro recibo' }).motivo).toBe('cargada sobre otro recibo');
  });
});

describe('devolucionListarSchema', () => {
  it('muestra las vigentes por defecto', () => {
    expect(devolucionListarSchema.parse({}).estado).toBe('vigentes');
  });
});
