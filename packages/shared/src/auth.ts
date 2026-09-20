import { z } from 'zod';

export const ROLES = ['SUPERADMIN', 'ADMIN'] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Administrador',
};

export const PASSWORD_MIN = 10;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Nombre de usuario para ingresar. Se guarda siempre en minúsculas, así que «Tesoreria»
 * y «tesoreria» son el mismo usuario y nadie puede registrar los dos.
 */
export const usernameSchema = z
  .string({ required_error: 'Ingresá el usuario' })
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `El usuario debe tener al menos ${USERNAME_MIN} caracteres`)
  .max(USERNAME_MAX, `Máximo ${USERNAME_MAX} caracteres`)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'Usá solo letras, números, punto, guion y guion bajo');

const emailSchema = z
  .string({ required_error: 'Ingresá el email' })
  .trim()
  .toLowerCase()
  .min(1, 'Ingresá el email')
  .email('Ingresá un email válido')
  .max(120);

export const passwordNuevaSchema = z
  .string({ required_error: 'Ingresá la contraseña' })
  .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
  .max(128, 'Máximo 128 caracteres')
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), 'La contraseña debe combinar letras y números');

export const loginSchema = z.object({
  /** Acá no se valida el formato: un usuario inexistente da el mismo error que una contraseña mala. */
  username: z.string({ required_error: 'Ingresá el usuario' }).trim().toLowerCase().min(1, 'Ingresá el usuario').max(USERNAME_MAX),
  password: z.string({ required_error: 'Ingresá la contraseña' }).min(1, 'Ingresá la contraseña').max(128),
});
export type LoginInput = z.input<typeof loginSchema>;
export type Login = z.output<typeof loginSchema>;

export const cambiarPasswordSchema = z
  .object({
    actual: z.string({ required_error: 'Ingresá tu contraseña actual' }).min(1, 'Ingresá tu contraseña actual'),
    nueva: passwordNuevaSchema,
    confirmacion: z.string({ required_error: 'Repetí la contraseña nueva' }),
  })
  .refine((d) => d.nueva === d.confirmacion, { message: 'Las contraseñas no coinciden', path: ['confirmacion'] })
  .refine((d) => d.nueva !== d.actual, { message: 'La contraseña nueva tiene que ser distinta de la actual', path: ['nueva'] });
export type CambiarPasswordInput = z.input<typeof cambiarPasswordSchema>;
export type CambiarPassword = z.output<typeof cambiarPasswordSchema>;

export const usuarioCrearSchema = z.object({
  nombre: z.string({ required_error: 'Ingresá el nombre' }).trim().min(1, 'Ingresá el nombre').max(80),
  /** Con esto ingresa al sistema. */
  username: usernameSchema,
  email: emailSchema,
  rol: z.enum(ROLES, { errorMap: () => ({ message: 'Elegí un rol' }) }),
  /** Contraseña temporal: el usuario la cambia en su primer ingreso. */
  password: passwordNuevaSchema,
});
export type UsuarioCrearInput = z.input<typeof usuarioCrearSchema>;
export type UsuarioCrear = z.output<typeof usuarioCrearSchema>;

export const usuarioActualizarSchema = usuarioCrearSchema.omit({ password: true }).partial();
export type UsuarioActualizarInput = z.input<typeof usuarioActualizarSchema>;
export type UsuarioActualizar = z.output<typeof usuarioActualizarSchema>;

export const restablecerPasswordSchema = z.object({ password: passwordNuevaSchema });
export type RestablecerPasswordInput = z.input<typeof restablecerPasswordSchema>;
export type RestablecerPassword = z.output<typeof restablecerPasswordSchema>;

export interface UsuarioSesion {
  id: number;
  nombre: string;
  username: string;
  email: string;
  rol: Rol;
  debeCambiarPassword: boolean;
}

export interface UsuarioListItem extends UsuarioSesion {
  activo: boolean;
  ultimoIngreso: string | null;
  createdAt: string;
}

/** Código de error cuando el usuario tiene que cambiar la contraseña antes de seguir. */
export const DEBE_CAMBIAR_PASSWORD = 'DEBE_CAMBIAR_PASSWORD';
