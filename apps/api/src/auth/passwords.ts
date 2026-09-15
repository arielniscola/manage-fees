import * as argon2 from 'argon2';

const OPCIONES: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => argon2.hash(password, OPCIONES);

// Hash de una contraseña cualquiera: se verifica contra él cuando el email no existe,
// para que la respuesta tarde lo mismo y no revele qué emails están registrados.
let hashFicticio: Promise<string> | undefined;

export async function verificarPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) {
    hashFicticio ??= hashPassword('contraseña-inexistente-0');
    await argon2.verify(await hashFicticio, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}
