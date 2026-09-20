import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_ESTADO_CIVIL,
  ETIQUETA_TIPO_SOCIO,
  formatearCuit,
  pesos,
  type AsignacionDeSocio,
  type SocioDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardHeader, ErrorCarga, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Encabezado } from '@/layout/AppLayout';
import { dni, fecha, iniciales, mesAnio, nombreCompleto, plural } from '@/lib/formato';
import { HistorialDePagos } from '@/features/cobros/HistorialDePagos';
import { PlanesDelSocio } from '@/features/planes/PlanesDelSocio';
import { CuotasDelSocio } from '@/features/cuotas/CuotasDelSocio';
import { useReactivarSocio, useSocio } from './api';
import { AsignarParcelaDialog, BajaSocioDialog, LiberarParcelaDialog } from './dialogs';

export function SocioDetallePage() {
  const { id } = useParams();
  const socioId = Number(id);
  const navigate = useNavigate();
  const { data: socio, isPending, isError, error, refetch } = useSocio(socioId);

  if (isError) return <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />;
  if (isPending) return <div className="h-40 animate-pulse rounded-card bg-superficie" />;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/socios" className="hover:underline">Socios</Link> / Ficha
          </>
        }
        titulo="Ficha del socio"
        acciones={<AccionesSocio socio={socio} onEditar={() => navigate(`/socios/${socio.id}/editar`)} />}
      />

      <Card className="flex flex-wrap items-center gap-5 px-7 py-6">
        <Avatar texto={iniciales(socio)} tamanio={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-serif text-[26px] font-medium">{nombreCompleto(socio)}</span>
            {socio.estado === 'activo' ? <Badge tono="ok">Activo</Badge> : <Badge tono="baja">Baja</Badge>}
            {socio.tipo === 'SUPLENTE' && <Badge tono="pend">{ETIQUETA_TIPO_SOCIO.SUPLENTE}</Badge>}
          </div>
          <span className="text-sm tabular text-tenue">
            N° {socio.numero} · Socio desde {mesAnio(socio.fechaAlta)}
            {socio.fechaBaja && ` · Baja el ${fecha(socio.fechaBaja)}${socio.motivoBaja ? ` (${socio.motivoBaja})` : ''}`}
          </span>
        </div>
        <div className="flex items-start gap-8 pr-2">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Parcelas vigentes</span>
            <span className="font-serif text-[30px] font-medium tabular">{socio.parcelas.length}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Deuda</span>
            <span className={`font-serif text-[30px] font-medium tabular ${socio.estadoCuenta.deuda > 0 ? 'text-mor' : ''}`}>
              {pesos(socio.estadoCuenta.deuda)}
            </span>
            {socio.estadoCuenta.pendientes > 0 && (
              <span className="text-xs text-tenue">
                {plural(socio.estadoCuenta.pendientes, 'cuota pendiente', 'cuotas pendientes')}
                {socio.estadoCuenta.vencidas > 0 && `, ${socio.estadoCuenta.vencidas} vencida${socio.estadoCuenta.vencidas === 1 ? '' : 's'}`}
              </span>
            )}
            {socio.estadoCuenta.interes > 0 && (
              <span className="text-xs text-tenue">incluye {pesos(socio.estadoCuenta.interes)} de interés</span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="flex flex-col gap-5 px-7 py-6">
          <h2 className="font-serif text-xl font-medium">Datos personales</h2>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-[18px]">
            <Dato etiqueta="DNI">{dni(socio.dni)}</Dato>
            <Dato etiqueta="CUIT">{socio.cuit ? formatearCuit(socio.cuit) : ''}</Dato>
            <Dato etiqueta="Fecha de nacimiento">{socio.fechaNacimiento ? fecha(socio.fechaNacimiento) : ''}</Dato>
            <Dato etiqueta="Estado civil">{socio.estadoCivil ? ETIQUETA_ESTADO_CIVIL[socio.estadoCivil] : ''}</Dato>
            <Dato etiqueta="Email">{socio.email}</Dato>
            <Dato etiqueta="Teléfono">{socio.telefono}</Dato>
            <Dato etiqueta="Fecha de alta">{fecha(socio.fechaAlta)}</Dato>
            <Dato etiqueta="Dirección" ancho>{socio.direccion}</Dato>
            {socio.observaciones && <Dato etiqueta="Observaciones" ancho>{socio.observaciones}</Dato>}
          </dl>

          <div className="flex flex-col gap-2 border-t border-borde pt-4">
            <span className="text-xs text-tenue">Documentación</span>
            <div className="flex flex-wrap gap-2">
              <Documento listo={socio.confirmado}>Confirmación</Documento>
              <Documento listo={socio.fotocopiaDni}>Fotocopia del DNI</Documento>
              <Documento listo={socio.actaMatrimonio}>Acta de matrimonio</Documento>
            </div>
          </div>
        </Card>

        <ParcelasSocio socio={socio} />
      </div>

      <CuotasDelSocio socio={socio} />

      <PlanesDelSocio socio={socio} />

      <HistorialDePagos socio={socio} />
    </>
  );
}

function AccionesSocio({ socio, onEditar }: { socio: SocioDetalle; onEditar: () => void }) {
  const [baja, setBaja] = useState(false);
  const reactivar = useReactivarSocio(socio.id);

  if (socio.estado === 'baja') {
    return (
      <Button
        variante="secundario"
        cargando={reactivar.isPending}
        onClick={() =>
          reactivar.mutate(undefined, {
            onSuccess: () => toast.success('Socio reactivado. Recordá asignarle sus parcelas.'),
            onError: (e) => toast.error(e.message),
          })
        }
      >
        <RotateCcw /> Reactivar socio
      </Button>
    );
  }

  return (
    <>
      <Button variante="secundario" className="text-mor" onClick={() => setBaja(true)}>
        Dar de baja
      </Button>
      <Button onClick={onEditar}>
        <Pencil /> Editar
      </Button>
      <BajaSocioDialog socio={socio} abierto={baja} onAbiertoChange={setBaja} />
    </>
  );
}

function ParcelasSocio({ socio }: { socio: SocioDetalle }) {
  const [asignar, setAsignar] = useState(false);
  const [liberar, setLiberar] = useState<AsignacionDeSocio | null>(null);
  const vigentes = socio.asignaciones.filter((a) => !a.hasta);
  const anteriores = socio.asignaciones.filter((a) => a.hasta);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Parcelas"
        descripcion={vigentes.length ? `${plural(vigentes.length, 'parcela vigente', 'parcelas vigentes')}` : undefined}
        acciones={
          socio.estado === 'activo' && (
            <Button variante="secundario" onClick={() => setAsignar(true)}>
              <Plus /> Asignar parcela
            </Button>
          )
        }
      />
      {socio.asignaciones.length === 0 ? (
        <Vacio
          titulo="Sin parcelas asignadas"
          descripcion={socio.estado === 'activo' ? 'Cada parcela asignada va a generar su propia cuota social.' : 'El socio está dado de baja.'}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Parcela</Th>
              <Th>Sector</Th>
              <Th>Desde</Th>
              <Th>Hasta</Th>
              <Th className="text-right" />
            </tr>
          </thead>
          <tbody>
            {[...vigentes, ...anteriores].map((a) => (
              <tr key={a.id} className={a.hasta ? 'text-tenue' : undefined}>
                <Td className="font-semibold tabular">{a.parcela.etiqueta}</Td>
                <Td>{a.parcela.sector?.nombre ?? '—'}</Td>
                <Td className="tabular">{fecha(a.desde)}</Td>
                <Td className="tabular">{a.hasta ? fecha(a.hasta) : <Badge tono="ok">Vigente</Badge>}</Td>
                <Td className="text-right">
                  {!a.hasta && (
                    <Button variante="terciario" tamanio="sm" onClick={() => setLiberar(a)}>
                      Liberar
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <AsignarParcelaDialog socio={socio} abierto={asignar} onAbiertoChange={setAsignar} />
      <LiberarParcelaDialog asignacion={liberar} onCerrar={() => setLiberar(null)} />
    </Card>
  );
}

/** Una tilde de documentación: en verde si ya se recibió, apagada si falta. */
function Documento({ listo, children }: { listo: boolean; children: ReactNode }) {
  return listo ? (
    <Badge tono="ok">{children}</Badge>
  ) : (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full bg-superficie-2 px-2.5 text-xs text-tenue">
      <span className="size-1.5 rounded-full bg-placeholder" />
      {children}
    </span>
  );
}

function Dato({ etiqueta, children, ancho }: { etiqueta: string; children: ReactNode; ancho?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${ancho ? 'col-span-2' : ''}`}>
      <dt className="text-xs text-tenue">{etiqueta}</dt>
      <dd className="text-[15px] tabular">{children || <span className="text-placeholder">Sin cargar</span>}</dd>
    </div>
  );
}
