import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { hoy, pesos } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { fecha, plural } from '@/lib/formato';
import { useGenerarCuotas, useVistaPreviaGeneracion } from './api';

/**
 * Genera las cuotas que falten hasta una fecha. Siempre muestra primero la vista previa:
 * la generación es idempotente, pero conviene ver qué se va a crear antes de crearlo.
 */
export function GenerarPeriodoDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const [hasta, setHasta] = useState(hoy);
  const previa = useVistaPreviaGeneracion(hasta, abierto && /^\d{4}-\d{2}-\d{2}$/.test(hasta));
  const generar = useGenerarCuotas();

  useEffect(() => {
    if (abierto) setHasta(hoy());
  }, [abierto]);

  const nada = previa.data && !previa.data.sinTarifa && previa.data.cuotas === 0;

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo="Generar período"
      descripcion="Se crean las cuotas de cada parcela asignada cuyo período ya haya empezado. Generar dos veces lo mismo no duplica nada."
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            {nada ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            cargando={generar.isPending}
            disabled={!previa.data || previa.data.sinTarifa || previa.data.cuotas === 0}
            onClick={() =>
              generar.mutate(
                { hasta, simular: false },
                {
                  onSuccess: (r) => {
                    toast.success(`Se generaron ${plural(r.cuotas, 'cuota')} para ${plural(r.socios, 'socio')}`);
                    onAbiertoChange(false);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {previa.data && previa.data.cuotas > 0 ? `Generar ${plural(previa.data.cuotas, 'cuota')}` : 'Generar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Generar hasta"
          htmlFor="generar-hasta"
          ayuda="Se incluyen los períodos que hayan empezado en esta fecha o antes."
          className="max-w-[220px]"
        >
          <Input id="generar-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="tabular" />
        </Field>

        {previa.isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Calculando…</p>
        ) : previa.isError ? (
          <Aviso tono="mor" icono={<AlertCircle />}>{previa.error.message}</Aviso>
        ) : previa.data.sinTarifa ? (
          <Aviso tono="pend" icono={<AlertCircle />}>
            Todavía no hay ninguna tarifa configurada.{' '}
            <Link to="/configuracion/cuota" onClick={() => onAbiertoChange(false)} className="font-semibold underline">
              Configurar la cuota
            </Link>{' '}
            para poder generar.
          </Aviso>
        ) : previa.data.cuotas === 0 ? (
          <Aviso tono="ok" icono={<CheckCircle2 />}>
            No hay nada pendiente: las {plural(previa.data.yaExistian, 'cuota')} de este rango ya estaban generadas.
          </Aviso>
        ) : (
          <>
            <div className="overflow-hidden rounded-control border border-borde">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Período</Th>
                    <Th>Vence</Th>
                    <Th className="text-right">Cuotas</Th>
                    <Th className="text-right">Importe</Th>
                  </tr>
                </thead>
                <tbody>
                  {previa.data.periodos.map((p) => (
                    <tr key={p.periodo}>
                      <Td className="font-medium first-letter:uppercase">{p.etiqueta}</Td>
                      <Td className="tabular text-tenue">{fecha(p.vencimiento)}</Td>
                      <Td className="text-right tabular">{p.cantidad}</Td>
                      <Td className="text-right tabular">{pesos(p.importe)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-superficie-2 font-semibold">
                    <Td>Total</Td>
                    <Td />
                    <Td className="text-right tabular">{previa.data.cuotas}</Td>
                    <Td className="text-right tabular">{pesos(previa.data.importe)}</Td>
                  </tr>
                </tbody>
              </Tabla>
            </div>
            <p className="text-[13px] text-tenue">
              Alcanza a {plural(previa.data.socios, 'socio')}.
              {previa.data.yaExistian > 0 && ` Se saltean ${plural(previa.data.yaExistian, 'cuota')} que ya existían.`}
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Aviso({ tono, icono, children }: { tono: 'ok' | 'pend' | 'mor'; icono: ReactNode; children: ReactNode }) {
  const estilos = {
    ok: 'bg-ok-fondo text-ok',
    pend: 'bg-pend-fondo text-pend',
    mor: 'bg-mor-fondo text-mor',
  }[tono];
  return (
    <div className={`flex items-start gap-2.5 rounded-control px-4 py-3 text-sm ${estilos} [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0`}>
      {icono}
      <span>{children}</span>
    </div>
  );
}
