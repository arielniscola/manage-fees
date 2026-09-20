import { describe, expect, it } from 'vitest';
import {
  CUERPO_PROXIMO_POR_DEFECTO,
  configuracionAvisosSchema,
  renderizarPlantilla,
  type DatosPlantilla,
} from './index';

const datos: DatosPlantilla = {
  socio: 'Carlos Ferreyra',
  club: 'Club de Campo El Pinar',
  cantidad: 2,
  total: 2400000,
  detalle: [
    'Parcela A-001 · octubre 2026 · vence 10/10/2026 · $ 12.000,00',
    'Parcela A-002 · octubre 2026 · vence 10/10/2026 · $ 12.000,00',
  ],
  vencimiento: '10/10/2026',
  dias: 5,
};

describe('renderizarPlantilla', () => {
  it('reemplaza las marcas por sus valores', () => {
    expect(renderizarPlantilla('Hola {{socio}}, son {{cantidad}} cuotas', datos)).toBe(
      'Hola Carlos Ferreyra, son 2 cuotas',
    );
  });

  it('formatea el total como pesos', () => {
    // 2.400.000 centavos son $ 24.000,00
    expect(renderizarPlantilla('Total: {{total}}', datos)).toBe('Total: $ 24.000,00');
  });

  it('pone una línea por cuota en el detalle', () => {
    expect(renderizarPlantilla('{{detalle}}', datos).split('\n')).toHaveLength(2);
  });

  it('tolera espacios dentro de las llaves', () => {
    expect(renderizarPlantilla('{{ socio }}', datos)).toBe('Carlos Ferreyra');
  });

  it('deja a la vista una marca que no existe, en vez de borrarla', () => {
    expect(renderizarPlantilla('Hola {{nombre}}', datos)).toBe('Hola {{nombre}}');
  });

  it('la plantilla por defecto no deja ninguna marca sin reemplazar', () => {
    const texto = renderizarPlantilla(CUERPO_PROXIMO_POR_DEFECTO, datos);
    expect(texto).not.toMatch(/\{\{/);
    expect(texto).toContain('Carlos Ferreyra');
    expect(texto).toContain('Parcela A-001');
  });
});

describe('configuracionAvisosSchema', () => {
  const base = {
    asuntoProximo: 'Asunto',
    cuerpoProximo: 'Cuerpo',
    asuntoVencida: 'Asunto',
    cuerpoVencida: 'Cuerpo',
  };

  it('aplica los valores por defecto', () => {
    const c = configuracionAvisosSchema.parse(base);
    expect(c).toMatchObject({ activo: false, diasAntes: 5, diasDespues: 3, horaEnvio: 9 });
  });

  it('acepta 0 días después para desactivar ese aviso', () => {
    expect(configuracionAvisosSchema.parse({ ...base, diasDespues: 0 }).diasDespues).toBe(0);
  });

  it('rechaza horas y días fuera de rango', () => {
    expect(configuracionAvisosSchema.safeParse({ ...base, horaEnvio: 24 }).success).toBe(false);
    expect(configuracionAvisosSchema.safeParse({ ...base, diasAntes: -1 }).success).toBe(false);
    expect(configuracionAvisosSchema.safeParse({ ...base, diasAntes: 61 }).success).toBe(false);
  });

  it('exige textos y valida la copia oculta', () => {
    expect(configuracionAvisosSchema.safeParse({ ...base, asuntoProximo: '  ' }).success).toBe(false);
    expect(configuracionAvisosSchema.safeParse({ ...base, copiaOculta: 'no-es-un-email' }).success).toBe(false);
    expect(configuracionAvisosSchema.parse({ ...base, copiaOculta: ' Club@Mail.com ' }).copiaOculta).toBe('club@mail.com');
    expect(configuracionAvisosSchema.parse({ ...base, copiaOculta: '' }).copiaOculta).toBeNull();
  });
});
