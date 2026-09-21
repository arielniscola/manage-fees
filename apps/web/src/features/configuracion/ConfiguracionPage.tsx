import { Link } from 'react-router';
import { Bell, CalendarClock, ChevronRight, FastForward, Percent } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ETIQUETA_ALCANCE, pesos } from '@mf/shared';
import { Card, ErrorCarga } from '@/components/ui/display';
import { Encabezado } from '@/layout/AppLayout';
import { useConfiguracionAvisos } from '@/features/avisos/api';
import { useTarifas } from '@/features/cuotas/api';
import { useConfiguracionAdelanto, useConfiguracionInteres } from './api';

/**
 * Índice de la configuración del club: lo que se define una vez y después rige para todo.
 * Cada tarjeta adelanta cómo está hoy, para no tener que entrar a cada una a mirar.
 */
export function ConfiguracionPage() {
  const avisos = useConfiguracionAvisos();
  const interes = useConfiguracionInteres();
  const adelanto = useConfiguracionAdelanto();
  const tarifas = useTarifas();

  // Hay una tarifa vigente por cuota: la social y la de parcela.
  const vigentes = (tarifas.data ?? []).filter((t) => t.vigente);
  const error = avisos.error ?? interes.error ?? adelanto.error ?? tarifas.error;

  return (
    <>
      <Encabezado antetitulo="Club" titulo="Configuración" />

      {error ? (
        <ErrorCarga
          mensaje={error.message}
          onReintentar={() => {
            void avisos.refetch();
            void interes.refetch();
            void adelanto.refetch();
            void tarifas.refetch();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Opcion
            a="/configuracion/cuota"
            icono={CalendarClock}
            titulo="Cuotas del período"
            descripcion="La cuota social y la de parcela: importe, cada cuánto se emiten y qué día vencen. Cada una lleva su historial, y un cambio solo afecta a los períodos futuros."
            estado={
              vigentes.length
                ? vigentes.map((t) => `${ETIQUETA_ALCANCE[t.alcance]} ${pesos(t.importe)}`).join(' · ')
                : undefined
            }
          />
          <Opcion
            a="/configuracion/interes"
            icono={Percent}
            titulo="Interés por mora"
            descripcion="El recargo que acumulan las cuotas impagas y el día del mes en que se aplica."
            estado={
              interes.data
                ? interes.data.activo
                  ? interes.data.modo === 'UNICO'
                    ? `${interes.data.porcentaje} % una sola vez, el día ${interes.data.diaAplicacion}`
                    : `${interes.data.porcentaje} % el día ${interes.data.diaAplicacion} de cada mes`
                  : 'Apagado: las cuotas vencidas no acumulan recargo'
                : undefined
            }
          />
          <Opcion
            a="/configuracion/adelanto"
            icono={FastForward}
            titulo="Pagos adelantados"
            descripcion="Hasta cuántos meses puede pagar por adelantado un socio y qué descuento lleva. Las cuotas futuras se crean recién cuando las paga."
            estado={
              adelanto.data
                ? adelanto.data.activo
                  ? `Hasta ${adelanto.data.mesesMaximos} meses${
                      adelanto.data.descuento > 0
                        ? ` · ${adelanto.data.descuento} % desde los ${adelanto.data.minimoMeses} meses`
                        : ' · sin descuento'
                    }`
                  : 'Apagado: no se pueden adelantar cuotas'
                : undefined
            }
          />
          <Opcion
            a="/configuracion/avisos"
            icono={Bell}
            titulo="Avisos de vencimiento"
            descripcion="Los correos que salen antes y después de que vence una cuota, con sus textos y su horario."
            estado={
              avisos.data
                ? avisos.data.activo
                  ? `Activos · se envían a las ${String(avisos.data.horaEnvio).padStart(2, '0')}:00`
                  : 'Apagados: no sale ningún correo'
                : undefined
            }
          />
        </div>
      )}
    </>
  );
}

function Opcion({
  a,
  icono: Icono,
  titulo,
  descripcion,
  estado,
}: {
  a: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  estado?: string;
}) {
  return (
    <Link to={a} className="group">
      <Card className="flex h-full items-start gap-4 px-6 py-5 transition-colors group-hover:bg-superficie-2">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-pino-50">
          <Icono className="size-5 text-pino-600" strokeWidth={1.6} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-serif text-lg font-medium">{titulo}</span>
          <span className="text-[13px] text-tenue">{descripcion}</span>
          <span className="mt-1 text-[13px] font-medium tabular">{estado ?? ' '}</span>
        </span>
        <ChevronRight className="mt-2 size-4 shrink-0 text-tenue" />
      </Card>
    </Link>
  );
}
