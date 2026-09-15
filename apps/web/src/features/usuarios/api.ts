import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RestablecerPasswordInput, UsuarioActualizarInput, UsuarioCrearInput, UsuarioListItem } from '@mf/shared';
import { api } from '@/lib/api';

const CLAVE = ['usuarios'] as const;

export function useUsuarios() {
  return useQuery({ queryKey: CLAVE, queryFn: () => api.get<UsuarioListItem[]>('/usuarios') });
}

function useMutacionUsuario<V>(fn: (v: V) => Promise<UsuarioListItem>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }) });
}

export const useCrearUsuario = () => useMutacionUsuario((data: UsuarioCrearInput) => api.post<UsuarioListItem>('/usuarios', data));

export const useActualizarUsuario = () =>
  useMutacionUsuario(({ id, ...data }: UsuarioActualizarInput & { id: number }) => api.patch<UsuarioListItem>(`/usuarios/${id}`, data));

export const useCambiarEstadoUsuario = () =>
  useMutacionUsuario(({ id, activo }: { id: number; activo: boolean }) =>
    api.post<UsuarioListItem>(`/usuarios/${id}/${activo ? 'activar' : 'desactivar'}`),
  );

export const useRestablecerPassword = () =>
  useMutacionUsuario(({ id, ...data }: RestablecerPasswordInput & { id: number }) =>
    api.post<UsuarioListItem>(`/usuarios/${id}/restablecer-password`, data),
  );

/** Contraseña temporal legible que cumple las reglas: letras y números, 14 caracteres. */
export function generarPasswordTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const azar = (conjunto: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => conjunto[x % conjunto.length]).join('');
  return `${azar(letras, 5)}-${azar(numeros, 4)}-${azar(letras, 3)}`;
}
