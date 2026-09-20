import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_ESTADO_PLAN,
  numeroPlan,
  pesos,
  planCancelarSchema,
  type EstadoPlan,
  type PlanCancelarInput,
  type PlanDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { BadgeCuota } from '@/features/cuotas/estados';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useCancelarPlan, usePlan } from './api';

const TONO: Record<EstadoPlan, 'ok' | 'pend' | 'mor' | 'baja'> = {
  vigente: 'pend',
  cumplido: 'ok',
  incumplido: 'mor',
  cancelado: 'baja',
};

export function BadgePlan({ estado }: { estado: EstadoPlan }) {
  return <Badge tono={TONO[estado]}>{ETIQUETA_ESTADO_PLAN[estado]}</Badge>;
}

/** Seguimiento del plan: sus cuotas, la deuda que absorbió y la opción de cancelarlo. */
export function PlanDetalleDialog({ planId, onCerrar }: { planId: number | null; onCerrar: () => void }) {
  const { data: plan, isPending, isError, error } = usePlan(planId);
  const [cancelando, setCancelando] = useState(false);

  return (
    <>
      <Dialog
        abierto={!!planId}
        onAbiertoChange={(v) => !v && onCerrar()}
        titulo={plan ? `Plan N° ${numeroPlan(plan.numero)}` : 'Plan de pago'}
        descripcion={plan ? `${nombreCompleto(plan.socio)} · N° ${plan.socio.numero} · firmado el ${fecha(plan.fecha)}` : undefined}
        pie={
          plan && (
            <div className="flex flex-1 items-center justify-between gap-4">
              {plan.estado === 'cancelado' ? (
                <span className="text-sm text-tenue">Este plan está cancelado.</span>
              ) : (
                <Button variante="peligro" tamanio="sm" onClick={() => setCancelando(true)}>
                  <Ban /> Cancelar plan
                </Button>
              )}
              <Button variante="secundario" onClick={onCerrar}>
                Cerrar
              </Button>
            </div>
          )
        }
      >
        {isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-mor">{error.message}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {plan.estado === 'cancelado' && (
              <div className="rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor">
                <b>Plan cancelado</b>
                {plan.canceladoEn && ` el ${fecha(plan.canceladoEn.slice(0, 10))}`}. {plan.motivoCancelacion}
                <span className="mt-1 block text-[13px]">
                  Las cuotas del plan se anularon y la deuda original volvió a pendiente.
                </span>
              </div>
            )}
            {plan.estado === 'incumplido' && (
              <div className="rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor">
                <b>Plan incumplido</b>: acumula {plural(plan.vencidas, 'cuota vencida', 'cuotas vencidas')} y la tolerancia
                es de {plan.toleranciaVencidas}. La deuda original no se revierte sola.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <BadgePlan estado={plan.estado} />
              <span className="text-sm text-tenue">
                {plan.pagadas} de {plan.cuotas.filter((c) => c.estado !== 'anulada').length} cuotas cobradas
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
              <Dato etiqueta="Deuda refinanciada">{pesos(plan.deudaTotal)}</Dato>
              <Dato etiqueta="Anticipo">{plan.anticipo > 0 ? pesos(plan.anticipo) : '—'}</Dato>
              <Dato etiqueta="Cobrado">
                <span className="text-ok">{pesos(plan.cobrado)}</span>
              </Dato>
              <Dato etiqueta="Saldo">
                <span className={plan.saldo > 0 ? 'font-semibold' : ''}>{pesos(plan.saldo)}</span>
              </Dato>
            </dl>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Cuotas del plan</h3>
              <div className="overflow-hidden rounded-control border border-borde">
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Cuota</Th>
                      <Th>Vence</Th>
                      <Th className="text-right">Importe</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.cuotas.map((c) => (
                      <tr key={c.cuotaId}>
                        <Td className="font-medium">
                          {c.numero === 0 ? 'Anticipo' : `Cuota ${c.numero} de ${plan.cantidadCuotas}`}
                        </Td>
                        <Td className="tabular text-tenue">{fecha(c.vencimiento)}</Td>
                        <Td className="text-right tabular">{pesos(c.importe)}</Td>
                        <Td className="w-px whitespace-nowrap">
                          <BadgeCuota estado={c.estado} diasVencida={c.diasVencida} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">
                Deuda refinanciada ({plural(plan.refinanciadas.length, 'cuota')})
              </h3>
              <div className="max-h-[200px] overflow-y-auto overflow-x-auto rounded-control border border-borde">
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Período</Th>
                      <Th>Parcela</Th>
                      <Th>Vencía</Th>
                      <Th className="text-right">Importe</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.refinanciadas.map((r) => (
                      <tr key={r.cuotaId}>
                        <Td className="first-letter:uppercase">{r.etiqueta}</Td>
                        <Td className="font-semibold tabular">{r.parcela ?? '—'}</Td>
                        <Td className="tabular text-tenue">{fecha(r.vencimiento)}</Td>
                        <Td className="text-right tabular">{pesos(r.importe)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            </div>

            {plan.observaciones && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-tenue">Observaciones</span>
                <p className="text-sm">{plan.observaciones}</p>
              </div>
            )}

            <Link to={`/socios/${plan.socio.id}`} onClick={onCerrar} className="text-[13px] font-semibold text-pino-600 hover:underline">
              Ver la ficha del socio
            </Link>
          </div>
        )}
      </Dialog>

      <CancelarPlanDialog plan={cancelando ? (plan ?? null) : null} onCerrar={() => setCancelando(false)} />
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-tenue">{etiqueta}</dt>
      <dd className="text-[15px] tabular">{children}</dd>
    </div>
  );
}

function CancelarPlanDialog({ plan, onCerrar }: { plan: PlanDetalle | null; onCerrar: () => void }) {
  const cancelar = useCancelarPlan();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanCancelarInput>({ resolver: zodResolver(planCancelarSchema) });

  useEffect(() => {
    if (plan) reset({ motivo: '' });
  }, [plan, reset]);

  const onSubmit = handleSubmit(({ motivo }) =>
    cancelar.mutate(
      { id: plan!.id, motivo },
      {
        onSuccess: () => {
          toast.success('Plan cancelado. La deuda original volvió a pendiente.');
          onCerrar();
        },
        onError: (e) => toast.error(e.message),
      },
    ),
  );

  return (
    <Dialog
      abierto={!!plan}
      onAbiertoChange={(v) => !v && onCerrar()}
      ancho="sm"
      titulo="Cancelar plan de pago"
      descripcion={
        plan
          ? `Plan N° ${numeroPlan(plan.numero)} por ${pesos(plan.deudaTotal)}. Sus cuotas pendientes se anulan y las ${plural(plan.refinanciadas.length, 'cuota')} refinanciadas vuelven a pendiente.`
          : undefined
      }
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>
            Volver
          </Button>
          <Button form="form-cancelar-plan" type="submit" variante="peligro" cargando={cancelar.isPending}>
            Cancelar plan
          </Button>
        </>
      }
    >
      <form id="form-cancelar-plan" onSubmit={onSubmit} noValidate>
        <Field label="Motivo" htmlFor="motivo-plan" requerido error={errors.motivo?.message}>
          <Textarea
            id="motivo-plan"
            autoFocus
            invalido={!!errors.motivo}
            placeholder="Por ejemplo: el socio no firmó el acuerdo"
            {...register('motivo')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
