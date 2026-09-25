import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, TrendingUp } from 'lucide-react';
import { hoy, inicioDelMes, pesos, pesosCortos, type MesDeEvolucion } from '@mf/shared';
import { Card, Chips, ErrorCarga } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha as formatoFecha, nombreCompleto, plural } from '@/lib/formato';
import { usePanel } from './api';

const COLOR_EMITIDO = '#b7cbae';
const COLOR_COBRADO = '#2b5337';

type Preset = 'mes' | 'trimestre' | 'anio' | 'custom';

/** Rangos de uso frecuente, para no tener que tipear fechas. */
function rangoDe(preset: Exclude<Preset, 'custom'>): { desde: string; hasta: string } {
  const hastaHoy = hoy();
  const [anio, mes] = hastaHoy.split('-').map(Number);
  if (preset === 'mes') return { desde: inicioDelMes(), hasta: hastaHoy };
  if (preset === 'anio') return { desde: `${anio}-01-01`, hasta: hastaHoy };
  const inicio = new Date(Date.UTC(anio, mes - 3, 1)).toISOString().slice(0, 10);
  return { desde: inicio, hasta: hastaHoy };
}

export function PanelPage() {
  const [preset, setPreset] = useState<Preset>('mes');
  const [rango, setRango] = useState(() => rangoDe('mes'));
  const { loteoId } = useLoteoActivo();
  const { data, isPending, isError, error, refetch } = usePanel({ ...rango, meses: 12, loteoId });

  const cambiarPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRango(rangoDe(p));
  };

  return (
    <>
      <Encabezado
        antetitulo="Resumen"
        titulo="Panel"
        acciones={
          <Link
            to="/reportes"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
          >
            <FileSpreadsheet /> Reportes
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Chips
          etiqueta="Período"
          valor={preset}
          onChange={cambiarPreset}
          opciones={[
            { valor: 'mes' as const, label: 'Este mes' },
            { valor: 'trimestre' as const, label: 'Últimos 3 meses' },
            { valor: 'anio' as const, label: 'Este año' },
            { valor: 'custom' as const, label: 'Otro' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Desde"
              className="w-[160px] tabular"
              value={rango.desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            />
            <span className="text-sm text-tenue">a</span>
            <Input
              type="date"
              aria-label="Hasta"
              className="w-[160px] tabular"
              value={rango.hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            />
          </div>
        )}
      </div>

      {isError ? (
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      ) : isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-superficie" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              etiqueta="Cobrado en el período"
              valor={pesosCortos(data.cobrado)}
              detalle={`${plural(data.cobros, 'cobro')} · ${formatoFecha(data.desde)} a ${formatoFecha(data.hasta)}`}
              tono="ok"
            />
            <Kpi
              etiqueta="Deuda total"
              valor={pesosCortos(data.deudaTotal)}
              detalle={`${plural(data.cuotasPendientes, 'cuota pendiente', 'cuotas pendientes')}`}
            />
            <Kpi
              etiqueta="Deuda vencida"
              valor={pesosCortos(data.deudaVencida)}
              detalle={`${plural(data.cuotasVencidas, 'cuota vencida', 'cuotas vencidas')}`}
              tono="mor"
            />
            <Kpi
              etiqueta="Morosidad"
              valor={`${data.morosidad.toFixed(1)} %`}
              detalle={`${data.sociosEnMora} de ${plural(data.sociosActivos, 'socio activo', 'socios activos')}`}
              tono={data.morosidad > 0 ? 'pend' : 'ok'}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Evolucion meses={data.evolucion} />
            <div className="flex flex-col gap-5">
              <TopMorosos morosos={data.topMorosos} />
              <Card className="flex flex-col gap-4 px-6 py-5">
                <h2 className="font-serif text-lg font-medium">La cooperativa hoy</h2>
                <dl className="flex flex-col gap-3">
                  <Dato etiqueta="Socios activos">{data.sociosActivos}</Dato>
                  <Dato etiqueta="Parcelas asignadas">
                    {data.parcelasAsignadas} <span className="text-tenue">de {data.parcelasTotales}</span>
                  </Dato>
                  <Dato etiqueta="Planes de pago vigentes">{data.planesVigentes}</Dato>
                </dl>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: 'ok' | 'mor' | 'pend';
}) {
  const color = tono ? { ok: 'text-ok', mor: 'text-mor', pend: 'text-pend' }[tono] : '';
  return (
    <Card className="flex flex-col gap-1 px-6 py-5">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">{etiqueta}</span>
      <span className={`font-serif text-[30px] font-medium leading-tight tabular ${color}`}>{valor}</span>
      <span className="text-[13px] text-tenue">{detalle}</span>
    </Card>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-borde pb-3 last:border-b-0 last:pb-0">
      <dt className="text-sm text-tenue">{etiqueta}</dt>
      <dd className="font-serif text-xl font-medium tabular">{children}</dd>
    </div>
  );
}

function Evolucion({ meses }: { meses: MesDeEvolucion[] }) {
  // El gráfico trabaja en pesos: en centavos los ejes quedan ilegibles.
  const datos = meses.map((m) => ({
    mes: m.etiqueta.slice(0, 3),
    anio: m.mes.slice(0, 4),
    emitido: m.emitido / 100,
    cobrado: m.cobrado / 100,
  }));
  const hayDatos = datos.some((d) => d.emitido > 0 || d.cobrado > 0);

  return (
    <Card className="flex flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-medium">Evolución de la cobranza</h2>
        <span className="text-[13px] text-tenue">Últimos {meses.length} meses</span>
      </div>

      {!hayDatos ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <TrendingUp className="size-8 text-placeholder" strokeWidth={1.5} />
          <p className="text-sm text-tenue">Todavía no hay cuotas ni cobros para graficar.</p>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="#e2dacb" />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={{ stroke: '#e2dacb' }}
                tick={{ fill: '#6d6a5f', fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={62}
                tick={{ fill: '#6d6a5f', fontSize: 12 }}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))}
              />
              <Tooltip
                cursor={{ fill: 'rgba(43,83,55,0.06)' }}
                formatter={(valor) => pesos(Number(valor) * 100)}
                labelFormatter={(_, carga) => {
                  const punto = carga?.[0]?.payload as { mes: string; anio: string } | undefined;
                  return punto ? `${punto.mes} ${punto.anio}` : '';
                }}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #e2dacb',
                  background: '#fffdf8',
                  fontSize: 13,
                }}
              />
              <Legend
                verticalAlign="top"
                align="left"
                height={28}
                iconType="circle"
                iconSize={9}
                formatter={(v: string) => <span style={{ color: '#6d6a5f', fontSize: 13 }}>{v}</span>}
              />
              <Bar dataKey="emitido" name="Emitido" fill={COLOR_EMITIDO} radius={[4, 4, 0, 0]} />
              <Bar dataKey="cobrado" name="Cobrado" fill={COLOR_COBRADO} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[13px] text-tenue">
        «Emitido» son las cuotas que vencían cada mes; «cobrado», lo que efectivamente entró ese mes. La diferencia
        entre las dos barras es la mora del período.
      </p>
    </Card>
  );
}

function TopMorosos({ morosos }: { morosos: { socio: { id: number; numero: number; nombre: string; apellido: string }; vencidas: number; deuda: number }[] }) {
  return (
    <Card className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-medium">Mayor deuda vencida</h2>
        <Link to="/socios?estado=moroso" className="text-[13px] font-semibold text-pino-600 hover:underline">
          Ver todos
        </Link>
      </div>

      {morosos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ok">Ningún socio tiene cuotas vencidas.</p>
      ) : (
        <ul className="flex flex-col">
          {morosos.map((m) => (
            <li key={m.socio.id} className="flex items-center justify-between gap-4 border-b border-borde py-2.5 last:border-b-0 last:pb-0">
              <Link to={`/socios/${m.socio.id}`} className="flex min-w-0 flex-col hover:underline">
                <span className="truncate text-sm font-medium">{nombreCompleto(m.socio)}</span>
                <span className="text-xs tabular text-tenue">{plural(m.vencidas, 'cuota vencida', 'cuotas vencidas')}</span>
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular text-mor">{pesosCortos(m.deuda)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
