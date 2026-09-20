import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { ETIQUETA_MEDIO_PAGO, numeroRecibo, pesos, type CobroListItem, type SocioDetalle } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, PieVerMas, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { urlRecibo, useCobrosDeSocio } from './api';
import { BadgeCobro, CobroDetalleDialog } from './CobroDetalleDialog';
import { RegistrarPagoDialog } from './RegistrarPagoDialog';

/** Pagos que se ven en la ficha; el resto queda para el modal. */
const VISIBLES = 5;

/** Historial de pagos del socio, con acceso a cada recibo. */
export function HistorialDePagos({ socio }: { socio: SocioDetalle }) {
  const { data: cobros, isPending, isError, error } = useCobrosDeSocio(socio.id);
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);
  const [viendoTodos, setViendoTodos] = useState(false);

  const vigentes = cobros?.filter((c) => !c.anulado) ?? [];
  const cobrado = vigentes.reduce((t, c) => t + c.total, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Historial de pagos"
        descripcion={
          isPending || !cobros?.length ? undefined : `${plural(vigentes.length, 'cobro')} · ${pesos(cobrado)} cobrados`
        }
        acciones={
          socio.estadoCuenta.pendientes > 0 && (
            <Button variante="secundario" onClick={() => setRegistrando(true)}>
              <Plus /> Registrar pago
            </Button>
          )
        }
      />

      {isPending ? (
        <div className="h-24 animate-pulse bg-superficie-2" />
      ) : isError ? (
        <p className="px-6 py-8 text-center text-sm text-mor">{error.message}</p>
      ) : cobros.length === 0 ? (
        <Vacio
          titulo="Sin pagos registrados"
          descripcion={
            socio.estadoCuenta.pendientes > 0
              ? 'Cuando el socio pague, registrá el cobro y el sistema emite el recibo.'
              : 'El socio todavía no tiene cuotas generadas.'
          }
          accion={
            socio.estadoCuenta.pendientes > 0 && (
              <Button onClick={() => setRegistrando(true)}>
                <Plus /> Registrar pago
              </Button>
            )
          }
        />
      ) : (
        <>
          <TablaCobros cobros={cobros.slice(0, VISIBLES)} onDetalle={setDetalle} />
          {cobros.length > VISIBLES && (
            <PieVerMas onClick={() => setViendoTodos(true)}>Ver los {cobros.length} pagos</PieVerMas>
          )}
          <Dialog
            abierto={viendoTodos}
            onAbiertoChange={setViendoTodos}
            ancho="lg"
            titulo="Todos los pagos"
            descripcion={`${nombreCompleto(socio)} · ${plural(vigentes.length, 'cobro')} · ${pesos(cobrado)} cobrados`}
          >
            <div className="-mx-6 -my-4">
              <TablaCobros cobros={cobros} onDetalle={setDetalle} />
            </div>
          </Dialog>
        </>
      )}

      <RegistrarPagoDialog abierto={registrando} onAbiertoChange={setRegistrando} socio={socio} />
      <CobroDetalleDialog cobroId={detalle} onCerrar={() => setDetalle(null)} />
    </Card>
  );
}

function TablaCobros({ cobros, onDetalle }: { cobros: CobroListItem[]; onDetalle: (id: number) => void }) {
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>Recibo</Th>
          <Th>Fecha</Th>
          <Th>Cuotas</Th>
          <Th>Medio</Th>
          <Th className="text-right">Total</Th>
          <Th>Estado</Th>
          <Th className="w-10" />
        </tr>
      </thead>
      <tbody>
        {cobros.map((c) => (
          <tr key={c.id} onClick={() => onDetalle(c.id)} className="cursor-pointer transition-colors hover:bg-superficie-2">
            <Td className="font-semibold tabular">{numeroRecibo(c.numeroRecibo)}</Td>
            <Td className="tabular">{fecha(c.fecha)}</Td>
            <Td className="tabular text-tenue">{c.cantidadCuotas}</Td>
            <Td>{ETIQUETA_MEDIO_PAGO[c.medio]}</Td>
            <Td className={`text-right tabular ${c.anulado ? 'text-tenue line-through' : 'font-semibold'}`}>{pesos(c.total)}</Td>
            <Td>
              <BadgeCobro anulado={c.anulado} />
            </Td>
            <Td className="text-right">
              <a
                href={urlRecibo(c.id)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Ver el recibo N° ${numeroRecibo(c.numeroRecibo)}`}
                aria-label={`Ver el recibo N° ${numeroRecibo(c.numeroRecibo)}`}
                className="inline-flex size-9 items-center justify-center rounded-lg text-tenue transition-colors hover:bg-pino-50 hover:text-pino-600 [&_svg]:size-4"
              >
                <FileText />
              </a>
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
