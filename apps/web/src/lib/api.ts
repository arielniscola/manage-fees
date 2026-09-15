import type { ApiErrorBody } from '@mf/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Evento global: la API respondió 401 (sesión vencida) o 403 por contraseña pendiente. */
export const EVENTO_SESION = 'mf:sesion';

type Query = Record<string, string | number | undefined | null>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();

  let res: Response;
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisá tu conexión.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    const error = new ApiError(res.status, err?.message ?? 'Ocurrió un error inesperado', err?.field, err?.code);
    if ((res.status === 401 && !path.startsWith('/auth/')) || err?.code === 'DEBE_CAMBIAR_PASSWORD') {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION, { detail: error }));
    }
    throw error;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};
