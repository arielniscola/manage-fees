import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_COLUMNA_HISTORIAL,
  etiquetaPeriodo,
  pesos,
  type FilaHistorial,
  type ResultadoHistorial,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Tabla, Td, Th } from '@/components/ui/display';
import { Encabezado } from '@/layout/AppLayout';
import { plural } from '@/lib/formato';
import { urlPlantillaHistorial, useImportarHistorial, usePrevisualizarHistorial } from './historial-api';

/**
 * Carga del historial de cuotas: lo que cada socio pagó y lo que debe de antes de usar el
 * sistema. Son dos pasos sobre el mismo archivo: primero se ve fila por fila qué va a
 * pasar, y recién con todo en orden se confirma. Entra en una sola transacción.
 */
export function ImportarHistorialPage() {
  const navigate = useNavigate();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<ResultadoHistorial | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const previsualizar = usePrevisualizarHistorial();
  const importar = useImportarHistorial();

  const elegir = (elegido: File | null) => {
    setArchivo(elegido);
    setPrevia(null);
    // Permite volver a elegir el mismo archivo después de corregirlo.
    if (input.current) input.current.value = '';
    if (!elegido) return;
    previsualizar.mutate(elegido, { onSuccess: setPrevia, onError: (e) => toast.error(e.message) });
  };

  const confirmar = () => {
    if (!archivo) return;
    importar.mutate(archivo, {
      onSuccess: (r) => {
        toast.success(
          `${plural(r.nuevas, 'cuota cargada', 'cuotas cargadas')} · ${plural(r.socios, 'socio')}`,
        );
        navigate('/cuotas');
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const faltanColumnas = (previa?.columnasFaltantes.length ?? 0) > 0;
  const sePuedeImportar = !!previa && !faltanColumnas && previa.conError === 0 && previa.nuevas > 0;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/socios" className="hover:underline">
              Socios
            </Link>{' '}
            / Historial
          </>
        }
        titulo="Cargar historial de cuotas"
        acciones={
          <a
            href={urlPlantillaHistorial()}
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4"
          >
            <Download /> Descargar plantilla
          </a>
        }
      />

      <Card className="flex flex-col gap-5 px-7 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-xl font-medium">El archivo</h2>
          <p className="text-[13px] text-tenue">
            Un Excel (.xlsx) o un CSV con una fila por cuota. La primera fila son los encabezados; no importa el orden
            ni las mayúsculas. Obligatorias: {ETIQUETA_COLUMNA_HISTORIAL.dni} (o {ETIQUETA_COLUMNA_HISTORIAL.numero}),{' '}
            {ETIQUETA_COLUMNA_HISTORIAL.periodo}, {ETIQUETA_COLUMNA_HISTORIAL.importe} y{' '}
            {ETIQUETA_COLUMNA_HISTORIAL.estado}. Opcionales: {ETIQUETA_COLUMNA_HISTORIAL.parcela} —vacía es la cuota
            social—, {ETIQUETA_COLUMNA_HISTORIAL.fechaPago}, {ETIQUETA_COLUMNA_HISTORIAL.vencimiento} y{' '}
            {ETIQUETA_COLUMNA_HISTORIAL.periodicidad}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
          <Button variante="secundario" onClick={() => input.current?.click()}>
            <Upload /> Elegir archivo
          </Button>
          {archivo ? (
            <span className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-tenue" />
              <span className="font-medium">{archivo.name}</span>
              <span className="text-tenue">({Math.max(1, Math.round(archivo.size / 1024))} KB)</span>
            </span>
          ) : (
            <span className="text-sm text-tenue">Todavía no elegiste ninguno.</span>
          )}
        </div>

        <p className="text-[13px] text-tenue">
          El período se escribe <b>2024-01</b>, <b>01/2024</b> o <b>enero 2024</b>, y el estado, <b>Pagada</b> o{' '}
          <b>Adeudada</b>. El importe lo trae cada fila: la cuota de 2023 valía lo que valía y no depende de las
          tarifas cargadas. Las pagadas quedan como pagadas <b>sin emitir recibo</b>, para no mezclar esa plata con la
          caja de la cooperativa; las adeudadas son deuda como cualquier otra y acumulan interés por mora si está activo. Los
          socios y las parcelas tienen que estar cargados, y los períodos que ya tienen cuota se omiten: volver a subir
          el mismo archivo no duplica nada.
        </p>
      </Card>

      {previsualizar.isPending && <div className="h-40 animate-pulse rounded-card bg-superficie" />}

      {previa && faltanColumnas && (
        <div className="flex items-start gap-2.5 rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <AlertCircle />
          <span>
            <b>Al archivo le faltan columnas obligatorias:</b>{' '}
            {previa.columnasFaltantes.map((c) => ETIQUETA_COLUMNA_HISTORIAL[c]).join(', ')}. Descargá la plantilla para
            ver los nombres que se esperan.
          </span>
        </div>
      )}

      {previa && !faltanColumnas && (
        <>
          <Resumen previa={previa} />

          <Card className="overflow-hidden">
            <CardHeader
              titulo="Fila por fila"
              descripcion="El número es el de la planilla, contando el encabezado, para poder corregir en el Excel."
            />
            <Tabla>
              <thead>
                <tr>
                  <Th>Fila</Th>
                  <Th>Socio</Th>
                  <Th>Parcela</Th>
                  <Th>Período</Th>
                  <Th className="text-right">Importe</Th>
                  <Th>Qué va a pasar</Th>
                </tr>
              </thead>
              <tbody>
                {previa.filas.map((f) => (
                  <Fila key={f.fila} fila={f} />
                ))}
              </tbody>
            </Tabla>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={confirmar} disabled={!sePuedeImportar} cargando={importar.isPending}>
              <CheckCircle2 /> Cargar {previa.nuevas > 0 ? plural(previa.nuevas, 'cuota') : 'historial'}
            </Button>
            <Button variante="secundario" onClick={() => elegir(null)}>
              Descartar
            </Button>
            {previa.conError > 0 && (
              <span className="text-[13px] text-mor">
                Corregí {previa.conError === 1 ? 'la fila con error' : `las ${previa.conError} filas con error`} y volvé
                a subir el archivo: la carga es todo o nada.
              </span>
            )}
            {previa.conError === 0 && previa.nuevas === 0 && (
              <span className="text-[13px] text-tenue">No hay nada nuevo: todas esas cuotas ya están cargadas.</span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Resumen({ previa }: { previa: ResultadoHistorial }) {
  const datos = [
    { etiqueta: 'Filas leídas', valor: String(previa.total), tono: '' },
    { etiqueta: 'Cuotas a cargar', valor: String(previa.nuevas), tono: 'text-ok' },
    { etiqueta: 'Socios', valor: String(previa.socios), tono: '' },
    { etiqueta: 'Pagadas', valor: `${previa.pagadas} · ${pesos(previa.importePagado)}`, tono: '' },
    { etiqueta: 'Adeudadas', valor: `${previa.adeudadas} · ${pesos(previa.importeAdeudado)}`, tono: previa.adeudadas > 0 ? 'text-pend' : '' },
    { etiqueta: 'Ya existían', valor: String(previa.omitidas), tono: 'text-tenue' },
    { etiqueta: 'Con error', valor: String(previa.conError), tono: previa.conError > 0 ? 'text-mor' : 'text-tenue' },
  ];

  return (
    <Card className="flex flex-wrap items-start gap-x-10 gap-y-5 px-7 py-6">
      {datos.map((d) => (
        <div key={d.etiqueta} className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">{d.etiqueta}</span>
          <span className={`font-serif text-[30px] font-medium tabular ${d.tono}`}>{d.valor}</span>
        </div>
      ))}
    </Card>
  );
}

function Fila({ fila }: { fila: FilaHistorial }) {
  const periodo = fila.cuota ? etiquetaPeriodo(fila.cuota.periodo, fila.cuota.periodicidad) : fila.crudo.periodo;

  return (
    <tr className={fila.estado === 'error' ? 'bg-mor-fondo/40' : undefined}>
      <Td className="tabular text-tenue">{fila.fila}</Td>
      <Td>
        <span className="flex flex-col">
          <span className="font-medium">
            {fila.socio ? `${fila.socio.apellido}, ${fila.socio.nombre}` : fila.crudo.socio || '—'}
          </span>
          {fila.socio && <span className="text-xs tabular text-tenue">N° {fila.socio.numero}</span>}
        </span>
      </Td>
      <Td className="tabular">
        {fila.crudo.parcela || <span className="text-tenue">Social</span>}
      </Td>
      <Td className="first-letter:uppercase">{periodo}</Td>
      <Td className="text-right tabular">{fila.cuota ? pesos(fila.cuota.importe) : fila.crudo.importe}</Td>
      <Td>
        <span className="flex flex-col gap-1">
          <QuePasa fila={fila} />
          {fila.errores.map((e) => (
            <span key={e} className="text-xs text-mor">
              {e}
            </span>
          ))}
          {fila.advertencias.map((a) => (
            <span key={a} className="text-xs text-tenue">
              {a}
            </span>
          ))}
        </span>
      </Td>
    </tr>
  );
}

function QuePasa({ fila }: { fila: FilaHistorial }) {
  if (fila.estado === 'error') return <Badge tono="mor">No se carga</Badge>;
  if (fila.estado === 'omitida') {
    return (
      <span className="flex flex-col gap-1">
        <Badge tono="baja">Se omite</Badge>
        {fila.motivoOmitida && <span className="text-xs text-tenue">{fila.motivoOmitida}</span>}
      </span>
    );
  }
  return fila.cuota?.pagada ? <Badge tono="ok">Se carga pagada</Badge> : <Badge tono="pend">Se carga adeudada</Badge>;
}
