import { useState } from 'react';
import { Plus } from 'lucide-react';
import { numeroPlan, pesos, type SocioDetalle } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { fecha, plural } from '@/lib/formato';
import { usePlanesDeSocio } from './api';
import { NuevoPlanDialog } from './NuevoPlanDialog';
import { BadgePlan, PlanDetalleDialog } from './PlanDetalleDialog';

/** Planes de pago del socio. Solo aparece si tiene alguno o si está en mora. */
export function PlanesDelSocio({ socio }: { socio: SocioDetalle }) {
  const { data: planes, isPending, isError, error } = usePlanesDeSocio(socio.id);
  const [creando, setCreando] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);

  const enMora = socio.estadoCuenta.vencidas > 0;
  if (isPending) return null;
  if (!isError && planes.length === 0 && !enMora) return null;

  const vigentes = planes?.filter((p) => p.estado === 'vigente' || p.estado === 'incumplido') ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Planes de pago"
        descripcion={
          isError || planes.length === 0
            ? undefined
            : vigentes.length > 0
              ? `${plural(vigentes.length, 'plan abierto', 'planes abiertos')} · ${pesos(vigentes.reduce((t, p) => t + p.saldo, 0))} de saldo`
              : `${plural(planes.length, 'plan', 'planes')} cerrados`
        }
        acciones={
          enMora &&
          socio.estado === 'activo' && (
            <Button variante="secundario" onClick={() => setCreando(true)}>
              <Plus /> Nuevo plan
            </Button>
          )
        }
      />

      {isError ? (
        <p className="px-6 py-8 text-center text-sm text-mor">{error.message}</p>
      ) : planes.length === 0 ? (
        <Vacio
          titulo="Sin planes de pago"
          descripcion={`El socio tiene ${plural(socio.estadoCuenta.vencidas, 'cuota vencida', 'cuotas vencidas')}. Si quiere refinanciar, armá un plan.`}
          accion={
            socio.estado === 'activo' && (
              <Button onClick={() => setCreando(true)}>
                <Plus /> Nuevo plan
              </Button>
            )
          }
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th>Firmado</Th>
              <Th>Cuotas</Th>
              <Th className="text-right">Deuda</Th>
              <Th className="text-right">Saldo</Th>
              <Th>Próximo vence</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => (
              <tr key={p.id} onClick={() => setDetalle(p.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
                <Td className="font-semibold tabular">{numeroPlan(p.numero)}</Td>
                <Td className="tabular">{fecha(p.fecha)}</Td>
                <Td className="tabular text-tenue">
                  {p.pagadas} de {p.cantidadCuotas}
                </Td>
                <Td className="text-right tabular">{pesos(p.deudaTotal)}</Td>
                <Td className={`text-right tabular ${p.saldo > 0 ? 'font-semibold' : 'text-tenue'}`}>{pesos(p.saldo)}</Td>
                <Td className="tabular text-tenue">{p.proximoVencimiento ? fecha(p.proximoVencimiento) : '—'}</Td>
                <Td>
                  <BadgePlan estado={p.estado} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <NuevoPlanDialog abierto={creando} onAbiertoChange={setCreando} socio={socio} />
      <PlanDetalleDialog planId={detalle} onCerrar={() => setDetalle(null)} />
    </Card>
  );
}
