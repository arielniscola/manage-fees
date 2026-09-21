import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { CambiarPasswordPage } from './features/auth/CambiarPasswordPage';
import { RequireAuth, RequireRol } from './features/auth/guards';
import { LoginPage } from './features/auth/LoginPage';
import { ConfiguracionAvisosPage } from './features/avisos/ConfiguracionAvisosPage';
import { HistorialEnviosPage } from './features/avisos/HistorialEnviosPage';
import { CobrosPage } from './features/cobros/CobrosPage';
import { AdelantoPage } from './features/configuracion/AdelantoPage';
import { ConfiguracionPage } from './features/configuracion/ConfiguracionPage';
import { InteresPage } from './features/configuracion/InteresPage';
import { PanelPage } from './features/panel/PanelPage';
import { ReportesPage } from './features/panel/ReportesPage';
import { ConfiguracionCuotaPage } from './features/cuotas/ConfiguracionCuotaPage';
import { CuotasPage } from './features/cuotas/CuotasPage';
import { PlanesPage } from './features/planes/PlanesPage';
import { ParcelaDetallePage } from './features/parcelas/ParcelaDetallePage';
import { ParcelasPage } from './features/parcelas/ParcelasPage';
import { SocioDetallePage } from './features/socios/SocioDetallePage';
import { SocioFormPage } from './features/socios/SocioFormPage';
import { ImportarSociosPage } from './features/socios/ImportarSociosPage';
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
          { index: true, element: <Navigate to="/panel" replace /> },
          { path: 'panel', element: <PanelPage /> },
          { path: 'reportes', element: <ReportesPage /> },
          { path: 'socios', element: <SociosPage /> },
          { path: 'socios/nuevo', element: <SocioFormPage /> },
          { path: 'socios/importar', element: <ImportarSociosPage /> },
          { path: 'socios/:id', element: <SocioDetallePage /> },
          { path: 'socios/:id/editar', element: <SocioFormPage /> },
          { path: 'parcelas', element: <ParcelasPage /> },
          { path: 'parcelas/:id', element: <ParcelaDetallePage /> },
          { path: 'cuotas', element: <CuotasPage /> },
          { path: 'cobros', element: <CobrosPage /> },
          { path: 'planes', element: <PlanesPage /> },
          { path: 'configuracion', element: <ConfiguracionPage /> },
          { path: 'configuracion/cuota', element: <ConfiguracionCuotaPage /> },
          { path: 'configuracion/interes', element: <InteresPage /> },
          { path: 'configuracion/adelanto', element: <AdelantoPage /> },
          { path: 'configuracion/avisos', element: <ConfiguracionAvisosPage /> },
          { path: 'configuracion/avisos/envios', element: <HistorialEnviosPage /> },
          // Los avisos vivían sueltos en el menú; los links viejos siguen funcionando.
          { path: 'avisos', element: <Navigate to="/configuracion/avisos" replace /> },
          { path: 'avisos/envios', element: <Navigate to="/configuracion/avisos/envios" replace /> },
          {
            path: 'usuarios',
            element: (
              <RequireRol rol="SUPERADMIN">
                <UsuariosPage />
              </RequireRol>
            ),
          },
          { path: '*', element: <Navigate to="/panel" replace /> },
        ],
      },
    ],
  },
]);
