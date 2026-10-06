import { describe, expect, it } from 'vitest';
import { loteAnularSchema, loteSchema, MAX_LOTE } from './index';

describe('loteSchema', () => {
  it('descarta los repetidos', () => {
    expect(loteSchema.parse({ ids: [3, 1, 3, 2, 1] }).ids).toEqual([3, 1, 2]);
  });

  it('exige al menos uno y respeta el tope', () => {
    expect(loteSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(loteSchema.safeParse({ ids: Array.from({ length: MAX_LOTE + 1 }, (_, i) => i + 1) }).success).toBe(false);
  });

  it('rechaza ids inválidos', () => {
    expect(loteSchema.safeParse({ ids: [0] }).success).toBe(false);
    expect(loteSchema.safeParse({ ids: [1.5] }).success).toBe(false);
  });
});

describe('loteAnularSchema', () => {
  it('exige un motivo con contenido', () => {
    expect(loteAnularSchema.safeParse({ ids: [1], motivo: 'x' }).success).toBe(false);
    expect(loteAnularSchema.parse({ ids: [1], motivo: '  generadas por error  ' }).motivo).toBe('generadas por error');
  });
});
