import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Check, ChevronsUpDown, FileSpreadsheet, HandCoins, KeyRound, LayoutDashboard, LogOut, Map, Receipt, ShieldCheck, SlidersHorizontal, TreePine, Users, Wallet } from 'lucide-react';
import { ETIQUETA_ROL, type UsuarioSesion } from '@mf/shared';
import { useLogout, useYo } from '@/features/auth/api';
import { useLoteos } from '@/features/parcelas/api';
import { LoteoActivoProvider, useLoteoActivo } from '@/layout/loteo-activo';
import { cn } from '@/lib/cn';

const NOMBRE_CLUB = import.meta.env.VITE_CLUB_NOMBRE || 'Gestión de socios';

// Los módulos de las etapas siguientes se suman acá a medida que se implementan.
const navegacion = [
  { to: '/panel', label: 'Panel', icono: LayoutDashboard, soloSuperadmin: false },
  { to: '/socios', label: 'Socios', icono: Users, soloSuperadmin: false },
  { to: '/parcelas', label: 'Parcelas', icono: Map, soloSuperadmin: false },
  { to: '/cuotas', label: 'Cuotas', icono: Receipt, soloSuperadmin: false },
  { to: '/cobros', label: 'Cobros', icono: Wallet, soloSuperadmin: false },
  { to: '/planes', label: 'Planes', icono: HandCoins, soloSuperadmin: false },
  { to: '/reportes', label: 'Reportes', icono: FileSpreadsheet, soloSuperadmin: false },
  { to: '/configuracion', label: 'Configuración', icono: SlidersHorizontal, soloSuperadmin: false },
  { to: '/usuarios', label: 'Usuarios', icono: ShieldCheck, soloSuperadmin: true },
];

export function AppLayout() {
  return (
    <LoteoActivoProvider>
      <Estructura />
    </LoteoActivoProvider>
  );
}

function Estructura() {
  const { data: usuario } = useYo();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col gap-8 bg-pino-700 px-4 py-6">
        <div className="flex items-center gap-3 px-2">
          <span className="inline-flex size-10 items-center justify-center rounded-control bg-superficie/12">
            <TreePine className="size-[22px] text-superficie" strokeWidth={1.6} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-serif text-lg font-medium text-superficie">{NOMBRE_CLUB}</span>
            <span className="text-xs text-pino-300">Gestión de socios</span>
          </div>
        </div>
        <SelectorDeLoteo />
        <nav className="flex flex-col gap-1">
          {navegacion
            .filter((n) => !n.soloSuperadmin || usuario?.rol === 'SUPERADMIN')
            .map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-[42px] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                  isActive ? 'bg-superficie/12 font-semibold text-superficie' : 'font-medium text-pino-100 hover:bg-superficie/6',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icono className={cn('size-[18px]', isActive ? 'text-superficie' : 'text-pino-300')} strokeWidth={1.6} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {usuario && <MenuCuenta usuario={usuario} />}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-10 pb-10 pt-9">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Elige el loteo que acota todos los listados. Si el loteo guardado se elimina, el
 * selector vuelve solo a «Todos los loteos» en lugar de filtrar por un id fantasma.
 */
function SelectorDeLoteo() {
  const { loteoId, elegir } = useLoteoActivo();
  const { data: loteos } = useLoteos();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, [abierto]);

  const activo = loteos?.find((l) => l.id === loteoId);
  useEffect(() => {
    if (loteoId && loteos && !loteos.some((l) => l.id === loteoId)) elegir(undefined);
  }, [loteoId, loteos, elegir]);

  if (!loteos?.length) return null;

  const opcion = (id: number | undefined, label: string) => (
    <button
      key={id ?? 'todos'}
      role="menuitem"
      type="button"
      className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-tinta hover:bg-superficie-2"
      onClick={() => {
        elegir(id);
        setAbierto(false);
      }}
    >
      <Check className={cn('size-4 shrink-0 text-pino-700', (loteoId ?? undefined) === id ? 'opacity-100' : 'opacity-0')} />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div ref={ref} className="relative -mt-4">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Loteo activo"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 rounded-control border border-superficie/14 bg-superficie/6 px-3 py-2 text-left hover:bg-superficie/10"
      >
        <Map className="size-[18px] shrink-0 text-pino-300" strokeWidth={1.6} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] uppercase tracking-wide text-pino-300">Loteo</span>
          <span className="truncate text-sm font-medium text-superficie">{activo?.nombre ?? 'Todos los loteos'}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-pino-300" />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-20 mt-2 flex max-h-[320px] flex-col gap-0.5 overflow-y-auto rounded-control border border-borde bg-superficie p-1.5 shadow-[0_12px_32px_rgba(18,36,25,0.2)]"
        >
          {opcion(undefined, 'Todos los loteos')}
          {loteos.map((l) => opcion(l.id, l.nombre))}
        </div>
      )}
    </div>
  );
}

export function Encabezado({ antetitulo, titulo, acciones }: { antetitulo?: ReactNode; titulo: string; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-1.5">
        {antetitulo && <span className="text-sm text-tenue">{antetitulo}</span>}
        <h1 className="font-serif text-4xl font-medium leading-tight tracking-[-0.01em]">{titulo}</h1>
      </div>
      {acciones && <div className="flex items-center gap-3">{acciones}</div>}
    </div>
  );
}

function MenuCuenta({ usuario }: { usuario: UsuarioSesion }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const logout = useLogout();

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, [abierto]);

  const iniciales = usuario.nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const opcion = 'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-tinta hover:bg-superficie-2 [&_svg]:size-4 [&_svg]:text-tenue';

  return (
    <div ref={ref} className="relative mt-auto border-t border-superficie/14 pt-4">
      {abierto && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 flex flex-col gap-0.5 rounded-control border border-borde bg-superficie p-1.5 shadow-[0_12px_32px_rgba(18,36,25,0.2)]">
          <div className="flex flex-col gap-0.5 px-3 pb-2 pt-1.5">
            <p className="truncate font-mono text-[13px] text-tinta">{usuario.username}</p>
            <p className="truncate text-xs text-tenue">{usuario.email}</p>
          </div>
          <Link role="menuitem" to="/cambiar-password" className={opcion} onClick={() => setAbierto(false)}>
            <KeyRound /> Cambiar contraseña
          </Link>
          <button
            role="menuitem"
            type="button"
            className={opcion}
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/ingresar', { replace: true }) })}
          >
            <LogOut /> Cerrar sesión
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-superficie/6"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-pino-100 text-xs font-semibold text-pino-700">{iniciales}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-superficie">{usuario.nombre}</span>
          <span className="text-xs text-pino-300">{ETIQUETA_ROL[usuario.rol]}</span>
        </span>
        <ChevronsUpDown className="size-4 text-pino-300" />
      </button>
    </div>
  );
}
