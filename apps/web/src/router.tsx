import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { CambiarPasswordPage } from './features/auth/CambiarPasswordPage';
import { RequireAuth, RequireRol } from './features/auth/guards';
import { LoginPage } from './features/auth/LoginPage';
import { ParcelasPage } from './features/parcelas/ParcelasPage';
import { SocioDetallePage } from './features/socios/SocioDetallePage';
import { SocioFormPage } from './features/socios/SocioFormPage';
import { SociosPage } from './features/socios/SociosPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';

export const router = createBrowserRouter([
  { path: '/ingresar', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/cambiar-password', element: <CambiarPasswordPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/socios" replace /> },
          { path: 'socios', element: <SociosPage /> },
          { path: 'socios/nuevo', element: <SocioFormPage /> },
          { path: 'socios/:id', element: <SocioDetallePage /> },
          { path: 'socios/:id/editar', element: <SocioFormPage /> },
          { path: 'parcelas', element: <ParcelasPage /> },
          {
            path: 'usuarios',
            element: (
              <RequireRol rol="SUPERADMIN">
                <UsuariosPage />
              </RequireRol>
            ),
          },
          { path: '*', element: <Navigate to="/socios" replace /> },
        ],
      },
    ],
  },
]);
