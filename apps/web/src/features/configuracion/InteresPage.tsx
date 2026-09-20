import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  configuracionInteresSchema,
  ETIQUETA_MODO_INTERES,
  interesDeCuota,
  hoy,
  MODOS_INTERES,
  pesos,
  vecesQueCorresponde,
  type ConfiguracionInteres,
  type ConfiguracionInteresGuardar,
  type ConfiguracionInteresInput,
  type ModoInteres,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorCarga } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { fecha as formatoFecha } from '@/lib/formato';
import { useConfiguracionInteres, useGuardarConfiguracionInteres } from './api';

/** Cuota de ejemplo para la vista previa: $10.000 que vencieron hace tres meses. */
const EJEMPLO_IMPORTE = 1_000_000;

const AYUDA_MODO: Record<ModoInteres, string> = {
  MENSUAL: 'Cada mes que la cuota sigue impaga se suma otra vez el porcentaje.',
  UNICO: 'Se recarga una sola vez, el primer día de aplicación después del vencimiento, y no crece más.',
};

/** Lo que está escrito en el formulario, ya interpretado, para las vistas previas. */
interface Simulacion {
  valido: boolean;
  modo: ModoInteres;
  porcentaje: number;
  diaAplicacion: number;
}

export function InteresPage() {
  const { data: config, isPending, isError, error, refetch } = useConfiguracionInteres();

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion" className="hover:underline">
              Configuración
            </Link>{' '}
            / Interés
          </>
        }
        titulo="Interés por mora"
      />

      {isError ? (
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      ) : isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-superficie" />
      ) : (
        <Formulario config={config} />
      )}
    </>
  );
}

function Formulario({ config }: { config: ConfiguracionInteres }) {
  const guardar = useGuardarConfiguracionInteres();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ConfiguracionInteresInput, unknown, ConfiguracionInteresGuardar>({
    resolver: zodResolver(configuracionInteresSchema),
    defaultValues: config,
  });

  useEffect(() => reset(config), [config, reset]);

  const activo = watch('activo');
  const porcentaje = Number(String(watch('porcentaje')).replace(',', '.'));
  const diaAplicacion = Number(watch('diaAplicacion'));
  const modo = (watch('modo') ?? 'MENSUAL') as ModoInteres;
  const simulacion: Simulacion = {
    valido: !!activo && porcentaje > 0 && diaAplicacion >= 1 && diaAplicacion <= 31,
    modo,
    porcentaje,
    diaAplicacion,
  };

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: () => toast.success('Interés guardado'),
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 px-7 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-xl font-medium">Cuánto y cuándo</h2>
          {config.activo ? <Badge tono="ok">Interés activo</Badge> : <Badge tono="baja">Interés apagado</Badge>}
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-pino-600" {...register('activo')} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Cobrar interés por mora</span>
            <span className="text-[13px] text-tenue">
              Con esto apagado las cuotas vencidas se cobran por su importe, sin recargo.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Interés"
            htmlFor="porcentaje"
            requerido
            error={errors.porcentaje?.message}
            ayuda={
              modo === 'UNICO'
                ? 'Porcentaje sobre el importe de la cuota'
                : 'Porcentaje sobre el importe de la cuota, cada vez que se aplica'
            }
          >
            <div className="relative">
              <Input
                id="porcentaje"
                inputMode="decimal"
                className="pr-8 tabular"
                placeholder="5"
                invalido={!!errors.porcentaje}
                {...register('porcentaje')}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">%</span>
            </div>
          </Field>
          <Field
            label="Día en que se aplica"
            htmlFor="diaAplicacion"
            requerido
            error={errors.diaAplicacion?.message}
            ayuda="En un mes más corto cae en el último día"
          >
            <Input
              id="diaAplicacion"
              type="number"
              min={1}
              max={31}
              className="tabular"
              invalido={!!errors.diaAplicacion}
              {...register('diaAplicacion')}
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Cuántas veces se aplica</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODOS_INTERES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors ${
                  modo === m ? 'border-pino-400 bg-pino-50' : 'border-borde hover:bg-superficie-2'
                }`}
              >
                <input type="radio" value={m} className="mt-0.5 size-4 accent-pino-600" {...register('modo')} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{ETIQUETA_MODO_INTERES[m]}</span>
                  <span className="text-[13px] text-tenue">{AYUDA_MODO[m]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-control bg-superficie-2 px-4 py-3 text-[13px] text-tenue [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <Info />
          <span>
            El interés se calcula <b>por cuota</b> y sobre su importe original:{' '}
            {modo === 'UNICO'
              ? `una cuota al ${porcentaje || 0} % se recarga ese ${porcentaje || 0} % y nada más, aunque pasen meses.`
              : `tres meses de mora al ${porcentaje || 0} % son ${(porcentaje || 0) * 3} %, no más.`} No genera una cuota aparte —la deuda de la cuota impaga se muestra ya
            recargada— y queda congelado en el recibo el día que el socio paga. Las cuotas de un plan de pago no
            acumulan interés: esa deuda ya se refinanció una vez.
          </span>
        </div>
      </Card>

      <VistaPrevia simulacion={simulacion} />
      <ProbarCaso simulacion={simulacion} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!isDirty || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {isDirty && (
          <Button type="button" variante="secundario" onClick={() => reset(config)}>
            Descartar
          </Button>
        )}
      </div>
    </form>
  );
}

/** Qué le pasaría a una cuota de $10.000 que venció hace tres meses, con lo que está escrito. */
function VistaPrevia({ simulacion }: { simulacion: Simulacion }) {
  const hoyISO = hoy();
  const [anio, mes, dia] = hoyISO.split('-').map(Number);
  const vencimiento = new Date(Date.UTC(anio, mes - 4, dia)).toISOString().slice(0, 10);

  const meses = [3, 2, 1, 0].map((atras) => {
    const fecha = new Date(Date.UTC(anio, mes - atras, dia)).toISOString().slice(0, 10);
    return { fecha, interes: calcular(simulacion, EJEMPLO_IMPORTE, vencimiento, fecha) };
  });

  return (
    <Card className="flex flex-col gap-4 px-7 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium">Cómo queda</h2>
        <p className="text-[13px] text-tenue">
          Una cuota de {pesos(EJEMPLO_IMPORTE)} que venció el {formatoFecha(vencimiento)} y sigue impaga.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {meses.map(({ fecha, interes }) => (
          <li key={fecha} className="flex items-baseline justify-between gap-4 text-sm tabular">
            <span className="text-tenue">{formatoFecha(fecha)}</span>
            <span>
              {interes === 0 ? (
                <span className="text-tenue">sin recargo</span>
              ) : (
                <>
                  <span className="text-tenue">+{pesos(interes)} · </span>
                  <span className="font-medium">{pesos(EJEMPLO_IMPORTE + interes)}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function calcular(simulacion: Simulacion, importe: number, vencimiento: string, fecha: string): number {
  if (!simulacion.valido) return 0;
  return interesDeCuota(
    { importe, vencimiento, estado: 'PENDIENTE', origen: 'PARCELA' },
    { activo: true, modo: simulacion.modo, porcentaje: simulacion.porcentaje, diaAplicacion: simulacion.diaAplicacion },
    fecha,
  );
}

/** «10.000,50» o «10000.5» → centavos. */
const aCentavos = (texto: string): number => {
  const limpio = texto.trim();
  const numero = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio);
  return Math.round(numero * 100);
};

/**
 * Calculadora para un caso puntual: con el importe, el vencimiento y una fecha, dice
 * cuántas veces se aplicó el recargo y cuánto da. Usa lo que está escrito arriba, aunque
 * todavía no se haya guardado.
 */
function ProbarCaso({ simulacion }: { simulacion: Simulacion }) {
  const hoyISO = hoy();
  const [importe, setImporte] = useState('10000');
  const [vencimiento, setVencimiento] = useState(`${hoyISO.slice(0, 7)}-01`);
  const [fecha, setFecha] = useState(hoyISO);

  const centavos = aCentavos(importe);
  const completo = Number.isFinite(centavos) && centavos > 0 && !!vencimiento && !!fecha;
  const veces = completo && simulacion.valido ? vecesQueCorresponde(vencimiento, fecha, simulacion) : 0;
  const interes = completo ? calcular(simulacion, centavos, vencimiento, fecha) : 0;

  return (
    <Card className="flex flex-col gap-4 px-7 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium">Probá un caso</h2>
        <p className="text-[13px] text-tenue">
          Cargá una cuota y una fecha para ver cuánto recargo le corresponde con la configuración de arriba, aunque
          todavía no la hayas guardado.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Importe de la cuota" htmlFor="caso-importe">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-tenue">$</span>
            <Input
              id="caso-importe"
              inputMode="decimal"
              className="pl-7 tabular"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Vencimiento" htmlFor="caso-vencimiento">
          <Input id="caso-vencimiento" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
        </Field>
        <Field label="Fecha a calcular" htmlFor="caso-fecha">
          <Input id="caso-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>

      {!simulacion.valido ? (
        <p className="text-sm text-tenue">Con el interés apagado o en 0 % no hay recargo.</p>
      ) : !completo ? (
        <p className="text-sm text-tenue">Completá el importe y las dos fechas.</p>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-4 rounded-control bg-superficie-2 px-4 py-3 text-sm">
          <span className="text-tenue">
            {veces > 0
              ? `Se aplicó ${veces === 1 ? 'una vez' : `${veces} veces`} el ${simulacion.porcentaje} %.`
              : fecha <= vencimiento
                ? 'Todavía no venció: sin recargo.'
                : `Venció, pero todavía no pasó un día ${simulacion.diaAplicacion}: sin recargo.`}
          </span>
          <span className="tabular">
            <span className="text-tenue">+{pesos(interes)} · </span>
            <span className="font-medium">{pesos(centavos + interes)}</span>
          </span>
        </div>
      )}
    </Card>
  );
}
