import { Injectable } from '@nestjs/common';

/** Prefijos de las claves que arma el login. */
export const CLAVE_USUARIO = 'usuario:';
export const CLAVE_IP = 'ip:';

/** Por usuario se bloquea rápido; por IP se tolera más porque varias personas pueden compartir la conexión. */
const MAX_FALLOS = { usuario: 5, ip: 30 } as const;
const VENTANA_MS = 15 * 60 * 1000;

const maximo = (clave: string) => (clave.startsWith(CLAVE_IP) ? MAX_FALLOS.ip : MAX_FALLOS.usuario);

/**
 * Limita los intentos fallidos de login por usuario y por IP.
 * Vive en memoria: alcanza para una sola instancia de la API, y reiniciarla lo borra.
 */
@Injectable()
export class LimitadorLogin {
  private readonly fallos = new Map<string, { cantidad: number; desde: number }>();

  /** Minutos que faltan para poder reintentar, o 0 si puede intentar. */
  bloqueado(claves: string[]): number {
    const ahora = Date.now();
    let espera = 0;
    for (const clave of claves) {
      const f = this.fallos.get(clave);
      if (!f) continue;
      if (ahora - f.desde > VENTANA_MS) {
        this.fallos.delete(clave);
      } else if (f.cantidad >= maximo(clave)) {
        espera = Math.max(espera, Math.ceil((f.desde + VENTANA_MS - ahora) / 60_000));
      }
    }
    return espera;
  }

  registrarFallo(claves: string[]) {
    const ahora = Date.now();
    for (const clave of claves) {
      const f = this.fallos.get(clave);
      if (!f || ahora - f.desde > VENTANA_MS) this.fallos.set(clave, { cantidad: 1, desde: ahora });
      else f.cantidad++;
    }
  }

  /** Tras un ingreso correcto se limpia solo el usuario: la IP conserva su conteo. */
  limpiar(claves: string[]) {
    for (const clave of claves) if (clave.startsWith(CLAVE_USUARIO)) this.fallos.delete(clave);
  }
}
