import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Search, Settings2 } from 'lucide-react';
import {
  ETIQUETA_RESULTADO_ENVIO,
  ETIQUETA_TIPO_AVISO,
  MAX_INTENTOS,
  pesos,
  type ResultadoEnvio,
} from '@mf/shared';
import { Badge, Card, Chips, ErrorCarga, FilasCargando, Paginacion, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useDebounce, useFiltrosUrl } from '@/lib/hooks';
import { useEnvios } from './api';

type EstadoFiltro = ResultadoEnvio | 'todos';
const PAGE_SIZE = 25;

const TONO: Record<ResultadoEnvio, 'ok' | 'mor' | 'pend'> = {
  ENVIADO: 'ok',
  FALLIDO: 'mor',
  SIN_EMAIL: 'pend',
};

/**
 * Historial de avisos. El filtro «Sin email» es el listado de socios a los que hay que
 * contactar por otra vía, con su teléfono a mano.
 */
export function HistorialEnviosPage() {
  const filtros = useFiltrosUrl<EstadoFiltro>('todos');
  const [texto, setTexto] = useState(filtros.q);
  const q = useDebounce(texto);

  useEffect(() => {
    if (q !== filtros.q) filtros.actualizar({ q });
  }, [q]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useEnvios({
    q: filtros.q || undefined,
    resultado: filtros.estado === 'todos' ? undefined : filtros.estado,
    page: filtros.page,
    pageSize: PAGE_SIZE,
  });

  const sinEmail = filtros.estado === 'SIN_EMAIL';

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion/avisos" className="hover:underline">
              Avisos
            </Link>{' '}
            / Historial
          </>
        }
        titulo={sinEmail ? 'Socios a contactar' : 'Historial de envíos'}
        acciones={
          <Link
            to="/configuracion/avisos"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
          >
            <Settings2 /> Configuración
          </Link>
        }
      />

      {data && (
        <div className="flex flex-wrap gap-3">
          <Resumen etiqueta="Enviados" valor={data.resumen.enviados} tono="ok" />
          <Resumen etiqueta="Con error" valor={data.resumen.fallidos} tono="mor" />
          <Resumen etiqueta="Sin email" valor={data.resumen.sinEmail} tono="pend" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <Input
            id="buscar-envio"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por socio, DNI, N° o email"
            className="pl-10"
            aria-label="Buscar envío"
          />
        </div>
        <Chips
          etiqueta="Resultado"
          valor={filtros.estado}
          onChange={(estado) => filtros.actualizar({ estado })}
          opciones={[
            { valor: 'todos' as const, label: 'Todos' },
            { valor: 'ENVIADO' as const, label: 'Enviados' },
            { valor: 'FALLIDO' as const, label: 'Con error' },
            { valor: 'SIN_EMAIL' as const, label: 'Sin email' },
          ]}
        />
      </div>

      {sinEmail && (
        <div className="flex items-start gap-2.5 rounded-control bg-pend-fondo px-4 py-3 text-sm text-pend [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <AlertCircle />
          <span>
            A estos socios no se les pudo avisar porque no tienen email cargado. Contactalos por teléfono, o cargales
            el email en su ficha para que reciban los próximos avisos.
          </span>
        </div>
      )}

      <Card className={isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
        {isError ? (
          <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
        ) : data && data.total === 0 ? (
          <Vacio
            titulo={
              filtros.q || filtros.estado !== 'todos' ? 'No hay envíos que coincidan' : 'Todavía no se envió ningún aviso'
            }
            descripcion={
              filtros.q || filtros.estado !== 'todos'
                ? 'Probá con otro socio o cambiá el filtro.'
                : 'Cuando el proceso corra, cada correo queda registrado acá.'
            }
          />
        ) : (
          <>
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Socio</Th>
                  <Th>Aviso</Th>
                  <Th>{sinEmail ? 'Teléfono' : 'Email'}</Th>
                  <Th className="text-right">Cuotas</Th>
                  <Th className="text-right">Importe</Th>
                  <Th>Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <FilasCargando columnas={7} />
                ) : (
                  data.items.map((e) => (
                    <tr key={e.id} className="hover:bg-superficie-2">
                      <Td className="tabular">{fecha(e.fecha)}</Td>
                      <Td>
                        <Link to={`/socios/${e.socio.id}`} className="font-medium text-tinta hover:underline">
                          {nombreCompleto(e.socio)}
                        </Link>
                        <span className="block text-xs tabular text-tenue">N° {e.socio.numero}</span>
                      </Td>
                      <Td className="text-[13px]">{ETIQUETA_TIPO_AVISO[e.tipo]}</Td>
                      <Td className="text-[13px]">
                        {sinEmail
                          ? (e.socio.telefono ?? <span className="text-tenue">Sin teléfono</span>)
                          : (e.email ?? <span className="text-tenue">—</span>)}
                      </Td>
                      <Td className="text-right tabular">{e.cantidadCuotas}</Td>
                      <Td className="text-right tabular">{pesos(e.importe)}</Td>
                      <Td>
                        <Badge tono={TONO[e.resultado]}>{ETIQUETA_RESULTADO_ENVIO[e.resultado]}</Badge>
                        {e.error && (
                          <span className="mt-1 block max-w-[280px] text-xs text-tenue" title={e.error}>
                            {e.resultado === 'FALLIDO' && e.intentos >= MAX_INTENTOS
                              ? `${plural(e.intentos, 'intento')}, no se reintenta más`
                              : e.error}
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Tabla>
            {data && (
              <Paginacion page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => filtros.actualizar({ page })} />
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: 'ok' | 'mor' | 'pend' }) {
  const color = { ok: 'text-ok', mor: 'text-mor', pend: 'text-pend' }[tono];
  return (
    <Card className="flex min-w-[150px] flex-1 flex-col gap-0.5 px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">{etiqueta}</span>
      <span className={`font-serif text-[28px] font-medium leading-none tabular ${color}`}>{valor}</span>
    </Card>
  );
}
