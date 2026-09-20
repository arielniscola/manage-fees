import { useState } from 'react';
import { Link } from 'react-router';
import { Download, FileSpreadsheet, LayoutDashboard } from 'lucide-react';
import {
  DESCRIPCION_REPORTE,
  ETIQUETA_REPORTE,
  TIPOS_REPORTE,
  USA_RANGO,
  hoy,
  inicioDelMes,
  type TipoReporte,
} from '@mf/shared';
import { Card } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha as formatoFecha } from '@/lib/formato';
import { urlReporte } from './api';

/**
 * Descarga de reportes. Salen de las mismas consultas que alimentan el panel, así que los
 * totales de un rango coinciden con los que se ven en pantalla.
 */
export function ReportesPage() {
  const { loteoId } = useLoteoActivo();
  const [desde, setDesde] = useState(inicioDelMes);
  const [hasta, setHasta] = useState(hoy);

  const rangoValido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/panel" className="hover:underline">
              Panel
            </Link>{' '}
            / Reportes
          </>
        }
        titulo="Reportes"
        acciones={
          <Link
            to="/panel"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
          >
            <LayoutDashboard /> Ir al panel
          </Link>
        }
      />

      <Card className="flex flex-wrap items-end gap-4 px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rep-desde" className="text-[13px] font-medium">
            Desde
          </label>
          <Input id="rep-desde" type="date" className="w-[170px] tabular" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rep-hasta" className="text-[13px] font-medium">
            Hasta
          </label>
          <Input id="rep-hasta" type="date" className="w-[170px] tabular" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <p className="flex-1 text-[13px] text-tenue">
          {rangoValido ? (
            <>
              Cobros y planes se filtran del {formatoFecha(desde)} al {formatoFecha(hasta)}. El padrón y los morosos son
              siempre una foto de hoy.
            </>
          ) : (
            <span className="text-mor">Revisá el rango: la fecha «desde» tiene que ser anterior a «hasta».</span>
          )}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {TIPOS_REPORTE.map((tipo) => (
          <TarjetaReporte key={tipo} tipo={tipo} desde={desde} hasta={hasta} loteoId={loteoId} habilitado={rangoValido} />
        ))}
      </div>

      <p className="text-[13px] text-tenue">
        El Excel trae una fila final con los totales y los importes con formato de moneda. El CSV usa punto y coma como
        separador, para que el Excel en español lo abra sin pasar por el asistente de importación.
      </p>
    </>
  );
}

function TarjetaReporte({
  tipo,
  desde,
  hasta,
  loteoId,
  habilitado,
}: {
  tipo: TipoReporte;
  desde: string;
  hasta: string;
  loteoId?: number;
  habilitado: boolean;
}) {
  // El rango solo aplica donde tiene sentido; el loteo activo acota todos los reportes.
  const rango = USA_RANGO[tipo] ? { desde, hasta, loteoId } : { loteoId };
  const boton =
    'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border px-4 text-sm font-semibold transition-colors [&_svg]:size-4';

  return (
    <Card className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-pino-50">
          <FileSpreadsheet className="size-5 text-pino-600" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-serif text-lg font-medium">{ETIQUETA_REPORTE[tipo]}</h2>
          <p className="text-[13px] text-tenue">{DESCRIPCION_REPORTE[tipo]}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {habilitado ? (
          <>
            <a href={urlReporte(tipo, 'xlsx', rango)} className={`${boton} border-pino-600 bg-pino-600 text-superficie hover:bg-pino-700`}>
              <Download /> Excel
            </a>
            <a href={urlReporte(tipo, 'csv', rango)} className={`${boton} border-borde bg-superficie text-tinta hover:bg-superficie-2`}>
              <Download /> CSV
            </a>
          </>
        ) : (
          <span className="text-[13px] text-tenue">Corregí el rango de fechas para poder descargar.</span>
        )}
        {!USA_RANGO[tipo] && <span className="text-xs text-tenue">No usa el rango de fechas</span>}
      </div>
    </Card>
  );
}
