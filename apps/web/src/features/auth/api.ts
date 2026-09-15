import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CambiarPasswordInput, LoginInput, UsuarioSesion } from '@mf/shared';
import { api, ApiError, EVENTO_SESION } from '@/lib/api';

const CLAVE_YO = ['auth', 'yo'] as const;

/** Usuario logueado, o null si no hay sesión. */
export function useYo() {
  return useQuery({
    queryKey: CLAVE_YO,
    queryFn: async () => {
      try {
        return await api.get<UsuarioSesion>('/auth/yo');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Mantiene el estado de sesión al día cuando la API avisa que venció o que falta cambiar la contraseña. */
export function useEventosSesion() {
  const qc = useQueryClient();
  useEffect(() => {
    const onSesion = (e: Event) => {
      const error = (e as CustomEvent<ApiError>).detail;
      if (error.status === 401) {
        qc.setQueryData(CLAVE_YO, null);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      } else {
        void qc.invalidateQueries({ queryKey: CLAVE_YO });
      }
    };
    window.addEventListener(EVENTO_SESION, onSesion);
    return () => window.removeEventListener(EVENTO_SESION, onSesion);
  }, [qc]);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LoginInput) => api.post<UsuarioSesion>('/auth/login', data),
    onSuccess: (usuario) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      qc.setQueryData(CLAVE_YO, usuario);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(CLAVE_YO, null);
    },
  });
}

export function useCambiarPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CambiarPasswordInput) => api.post<UsuarioSesion>('/auth/cambiar-password', data),
    onSuccess: (usuario) => qc.setQueryData(CLAVE_YO, usuario),
  });
}
