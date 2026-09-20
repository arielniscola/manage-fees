import { describe, expect, it } from 'vitest';
import {
  cambiarPasswordSchema,
  cobroListarSchema,
  cuotaListarSchema,
  etiquetaParcela,
  hoy,
  loginSchema,
  parcelaCrearSchema,
  passwordNuevaSchema,
  planListarSchema,
  sectorListarSchema,
  socioActualizarSchema,
  socioCrearSchema,
  socioListarSchema,
  usuarioCrearSchema,
} from './index';

const socioValido = { nombre: 'Ana', apellido: 'López', dni: '40.118.623' };

describe('socioCrearSchema', () => {
  it('normaliza el DNI quitando puntos y espacios', () => {
    expect(socioCrearSchema.parse(socioValido).dni).toBe('40118623');
    expect(socioCrearSchema.parse({ ...socioValido, dni: '40 118 623' }).dni).toBe('40118623');
  });

  it('rechaza DNI con letras o longitud incorrecta', () => {
    expect(socioCrearSchema.safeParse({ ...socioValido, dni: '40A18623' }).success).toBe(false);
    expect(socioCrearSchema.safeParse({ ...socioValido, dni: '12345' }).success).toBe(false);
  });

  it('convierte los textos opcionales vacíos en null', () => {
    const r = socioCrearSchema.parse({ ...socioValido, email: '', telefono: '  ', direccion: undefined });
    expect(r.email).toBeNull();
    expect(r.telefono).toBeNull();
    expect(r.direccion).toBeNull();
    expect(r.numero).toBeNull();
  });

  it('valida y normaliza el email', () => {
    expect(socioCrearSchema.parse({ ...socioValido, email: 'Ana.Lopez@Mail.com' }).email).toBe('ana.lopez@mail.com');
    expect(socioCrearSchema.safeParse({ ...socioValido, email: 'ana.lopez@' }).success).toBe(false);
  });

  it('usa la fecha de hoy como alta por defecto', () => {
    expect(socioCrearSchema.parse(socioValido).fechaAlta).toBe(hoy());
  });

  it('exige nombre y apellido', () => {
    const r = socioCrearSchema.safeParse({ nombre: ' ', apellido: '', dni: '40118623' });
    expect(r.success).toBe(false);
  });
});

describe('socioActualizarSchema', () => {
  it('permite actualizaciones parciales sin pisar la fecha de alta', () => {
    expect(socioActualizarSchema.parse({ telefono: '11 5555-5555' })).toEqual({ telefono: '11 5555-5555' });
  });
});

describe('parcelaCrearSchema', () => {
  it('pasa el código a mayúsculas', () => {
    expect(parcelaCrearSchema.parse({ codigo: ' a-12 ' }).codigo).toBe('A-12');
  });
});

describe('esquemas de usuarios', () => {
  it('exige contraseñas de al menos 10 caracteres con letras y números', () => {
    expect(passwordNuevaSchema.safeParse('corta1').success).toBe(false);
    expect(passwordNuevaSchema.safeParse('sololetrasaqui').success).toBe(false);
    expect(passwordNuevaSchema.safeParse('1234567890').success).toBe(false);
    expect(passwordNuevaSchema.safeParse('pinoverde2026').success).toBe(true);
  });

  it('normaliza el usuario del login: se ingresa con username, no con email', () => {
    expect(loginSchema.parse({ username: '  Tesoreria ', password: 'x' }).username).toBe('tesoreria');
    expect(loginSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
  });

  it('valida el formato del username al crear un usuario', () => {
    const base = { nombre: 'Ana', email: 'ana@club.org', rol: 'ADMIN', password: 'pinoverde2026' };
    expect(usuarioCrearSchema.parse({ ...base, username: ' Ana.Lopez ' }).username).toBe('ana.lopez');
    expect(usuarioCrearSchema.safeParse({ ...base, username: 'ab' }).success).toBe(false);
    expect(usuarioCrearSchema.safeParse({ ...base, username: 'ana lopez' }).success).toBe(false);
    expect(usuarioCrearSchema.safeParse({ ...base, username: '.ana' }).success).toBe(false);
    expect(usuarioCrearSchema.safeParse({ ...base, username: 'ana@club' }).success).toBe(false);
  });

  it('valida que la confirmación coincida y que la nueva sea distinta', () => {
    const r1 = cambiarPasswordSchema.safeParse({ actual: 'viejaClave1', nueva: 'nuevaClave22', confirmacion: 'otraClave22' });
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.error.issues[0]?.path).toEqual(['confirmacion']);
    const r2 = cambiarPasswordSchema.safeParse({ actual: 'mismaClave1', nueva: 'mismaClave1', confirmacion: 'mismaClave1' });
    expect(r2.success).toBe(false);
  });

  it('rechaza roles desconocidos', () => {
    expect(
      usuarioCrearSchema.safeParse({ nombre: 'Ana', username: 'ana', email: 'ana@club.org', rol: 'ROOT', password: 'pinoverde2026' }).success,
    ).toBe(false);
  });
});

describe('loteo activo en los listados', () => {
  const listados = [
    ['socios', socioListarSchema],
    ['cuotas', cuotaListarSchema],
    ['cobros', cobroListarSchema],
    ['planes', planListarSchema],
    ['sectores', sectorListarSchema],
  ] as const;

  it('acepta el loteo como número o como texto de la query', () => {
    for (const [nombre, schema] of listados) {
      expect(schema.parse({ loteoId: 3 }).loteoId, nombre).toBe(3);
      expect(schema.parse({ loteoId: '3' }).loteoId, nombre).toBe(3);
    }
  });

  it('sin loteo activo el filtro queda en undefined', () => {
    for (const [nombre, schema] of listados) {
      expect(schema.parse({}).loteoId, nombre).toBeUndefined();
    }
  });

  it('rechaza ids que no son un loteo posible', () => {
    for (const [nombre, schema] of listados) {
      expect(schema.safeParse({ loteoId: 0 }).success, nombre).toBe(false);
      expect(schema.safeParse({ loteoId: -1 }).success, nombre).toBe(false);
      expect(schema.safeParse({ loteoId: 'lavalle' }).success, nombre).toBe(false);
    }
  });
});

describe('etiquetaParcela', () => {
  const sector = (loteo: string | null) => ({
    id: 1,
    nombre: '7',
    loteo: loteo === null ? null : { id: 1, nombre: loteo },
  });

  it('pone el loteo adelante, porque el código solo es único dentro del sector', () => {
    expect(etiquetaParcela({ codigo: '7-1', sector: sector('Lavalle') })).toBe('Lavalle · 7-1');
  });

  it('distingue dos parcelas con el mismo código en loteos distintos', () => {
    const lavalle = etiquetaParcela({ codigo: '7-1', sector: sector('Lavalle') });
    const maipu = etiquetaParcela({ codigo: '7-1', sector: sector('Maipú') });
    expect(lavalle).not.toBe(maipu);
  });

  it('se queda con el código cuando no hay loteo del que colgar', () => {
    expect(etiquetaParcela({ codigo: '7-1', sector: sector(null) })).toBe('7-1');
    expect(etiquetaParcela({ codigo: '7-1', sector: null })).toBe('7-1');
  });
});
