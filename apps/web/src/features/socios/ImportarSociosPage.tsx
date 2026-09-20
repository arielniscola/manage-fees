import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ETIQUETA_COLUMNA, type FilaImportacion, type ResultadoImportacion } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Tabla, Td, Th } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { plural } from '@/lib/formato';
import { useLoteos } from '@/features/parcelas/api';
import { urlPlantillaPadron, useImportarSocios, usePrevisualizarImportacion } from './api';

/**
 * Importación del padrón desde una planilla. Son dos pasos sobre el mismo archivo: primero
 * se ve fila por fila qué va a pasar, y recién con todo en orden se confirma. La carga
 * entra en una sola transacción, así que o están todos los socios o no está ninguno.
 */
export function ImportarSociosPage() {
  const navigate = useNavigate();
  const activo = useLoteoActivo();
  const loteos = useLoteos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [loteoId, setLoteoId] = useState<number | undefined>(activo.loteoId);
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const previsualizar = usePrevisualizarImportacion();
  const importar = useImportarSocios();

  const analizar = (elegido: File | null, loteo: number | undefined) => {
    setPrevia(null);
    if (!elegido) return;
    previsualizar.mutate(
      { archivo: elegido, loteoId: loteo },
      { onSuccess: setPrevia, onError: (e) => toast.error(e.message) },
    );
  };

  const elegir = (elegido: File | null) => {
    setArchivo(elegido);
    // Permite volver a elegir el mismo archivo después de corregirlo.
    if (input.current) input.current.value = '';
    analizar(elegido, loteoId);
  };

  const cambiarLoteo = (id: number | undefined) => {
    setLoteoId(id);
    analizar(archivo, id);
  };

  const confirmar = () => {
    if (!archivo) return;
    importar.mutate(
      { archivo, loteoId },
      {
        onSuccess: (r) => {
          const partes = [
            r.nuevos > 0 && plural(r.nuevos, 'socio importado', 'socios importados'),
            r.parcelasNuevas > 0 && plural(r.parcelasNuevas, 'lote creado', 'lotes creados'),
          ].filter(Boolean);
          toast.success(partes.join(' · '));
          navigate('/socios');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const faltanColumnas = (previa?.columnasFaltantes.length ?? 0) > 0;
  const hayAlgoNuevo = !!previa && (previa.nuevos > 0 || previa.parcelasNuevas > 0);
  const sePuedeImportar = !!previa && !faltanColumnas && previa.conError === 0 && hayAlgoNuevo;
  const nombreLoteo = loteos.data?.find((l) => l.id === loteoId)?.nombre;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/socios" className="hover:underline">
              Socios
            </Link>{' '}
            / Importar
          </>
        }
        titulo="Importar padrón"
        acciones={
          <a
            href={urlPlantillaPadron()}
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
            Un Excel (.xlsx) o un CSV con una fila por lote, como la base de datos de asociados. La primera fila son los
            encabezados; no importa el orden ni las mayúsculas. Obligatorias: {ETIQUETA_COLUMNA.nombreCompleto} (o
            Apellido y Nombre por separado) y {ETIQUETA_COLUMNA.dni}. Las demás —{ETIQUETA_COLUMNA.manzana},{' '}
            {ETIQUETA_COLUMNA.lote}, {ETIQUETA_COLUMNA.superficie}, {ETIQUETA_COLUMNA.cuit},{' '}
            {ETIQUETA_COLUMNA.fechaNacimiento}, {ETIQUETA_COLUMNA.telefono}, {ETIQUETA_COLUMNA.confirmado}…— son
            opcionales.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
          <Field
            label="Loteo"
            htmlFor="loteo-importacion"
            ayuda={
              loteoId
                ? 'Las manzanas y lotes que no existan se crean en este loteo.'
                : 'Sin loteo, las parcelas del archivo tienen que estar cargadas.'
            }
          >
            <Select
              id="loteo-importacion"
              value={loteoId ?? ''}
              onChange={(e) => cambiarLoteo(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Ninguno: usar parcelas existentes</option>
              {loteos.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap items-center gap-3 sm:pb-6">
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
        </div>

        <p className="text-[13px] text-tenue">
          Si un socio tiene varios lotes, aparece en varias filas con el mismo DNI: se da de alta una vez y se le asignan
          todos. Un socio con lotes entra como titular; uno sin lotes, como suplente. Las filas sin nombre ni DNI son lotes
          libres. Los socios que ya existen —mismo DNI— se omiten, así que reimportar el mismo archivo no duplica nada.
        </p>
      </Card>

      {previsualizar.isPending && <div className="h-40 animate-pulse rounded-card bg-superficie" />}

      {previa && faltanColumnas && (
        <div className="flex items-start gap-2.5 rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <AlertCircle />
          <span>
            <b>Al archivo le faltan columnas obligatorias:</b>{' '}
            {previa.columnasFaltantes.map((c) => ETIQUETA_COLUMNA[c]).join(', ')}. Descargá la plantilla para ver los
            nombres que se esperan.
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
                  <Th>DNI</Th>
                  <Th>Parcelas</Th>
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
              <CheckCircle2 /> Importar
              {previa.nuevos > 0 ? ` ${plural(previa.nuevos, 'socio')}` : ''}
              {previa.parcelasNuevas > 0 ? ` y crear ${plural(previa.parcelasNuevas, 'lote')}` : ''}
            </Button>
            <Button variante="secundario" onClick={() => elegir(null)}>
              Descartar
            </Button>
            {previa.conError > 0 && (
              <span className="text-[13px] text-mor">
                Corregí {previa.conError === 1 ? 'la fila con error' : `las ${previa.conError} filas con error`} y volvé
                a subir el archivo: la importación es todo o nada.
              </span>
            )}
            {previa.conError === 0 && !hayAlgoNuevo && (
              <span className="text-[13px] text-tenue">No hay nada nuevo: todos los socios y lotes del archivo ya existen.</span>
            )}
            {previa.conError === 0 && previa.parcelasNuevas > 0 && nombreLoteo && (
              <span className="text-[13px] text-tenue">Los lotes nuevos se crean en {nombreLoteo}.</span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Resumen({ previa }: { previa: ResultadoImportacion }) {
  const datos = [
    { etiqueta: 'Filas leídas', valor: previa.total, tono: '' },
    { etiqueta: 'Socios nuevos', valor: previa.nuevos, tono: 'text-ok' },
    { etiqueta: 'Parcelas a asignar', valor: previa.asignaciones, tono: '' },
    { etiqueta: 'Lotes a crear', valor: previa.parcelasNuevas, tono: '' },
    { etiqueta: 'Ya existían', valor: previa.omitidos, tono: 'text-tenue' },
    { etiqueta: 'Con advertencias', valor: previa.conAdvertencias, tono: previa.conAdvertencias > 0 ? 'text-pend' : 'text-tenue' },
    { etiqueta: 'Con error', valor: previa.conError, tono: previa.conError > 0 ? 'text-mor' : 'text-tenue' },
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

function Fila({ fila }: { fila: FilaImportacion }) {
  const nombre = `${fila.crudo.apellido}, ${fila.crudo.nombre}`.replace(/^, |, $/, '').trim();

  return (
    <tr className={fila.estado === 'error' ? 'bg-mor-fondo/40' : undefined}>
      <Td className="tabular text-tenue">{fila.fila}</Td>
      <Td>
        <span className="font-medium">{nombre || <span className="text-tenue">(sin socio)</span>}</span>
        {fila.crudo.numero && <span className="block text-xs tabular text-tenue">N° {fila.crudo.numero}</span>}
      </Td>
      <Td className="tabular">{fila.socio?.dni ?? fila.crudo.dni}</Td>
      <Td className="tabular">
        {fila.parcelas.length === 0
          ? '—'
          : fila.parcelas.map((p) => (
              <span key={p.codigo} className="block whitespace-nowrap">
                {p.codigo}
                {p.nueva && <span className="ml-1.5 text-xs text-tenue">(se crea)</span>}
              </span>
            ))}
      </Td>
      <Td>
        {fila.estado === 'nueva' && <Badge tono="ok">Se importa</Badge>}
        {fila.estado === 'agrupada' && (
          <>
            <Badge tono="ok">Se suma al socio</Badge>
            <span className="mt-1 block text-xs text-tenue">Mismo DNI que la fila {fila.agrupadaEn}: otro lote del mismo socio</span>
          </>
        )}
        {fila.estado === 'sinSocio' && (
          <>
            <Badge tono="pino">Lote libre</Badge>
            <span className="mt-1 block text-xs text-tenue">Se crea sin titular</span>
          </>
        )}
        {fila.estado === 'omitida' && (
          <>
            <Badge tono="baja">Se omite</Badge>
            <span className="mt-1 block text-xs text-tenue">{fila.motivoOmitida}</span>
          </>
        )}
        {fila.estado === 'error' && (
          <>
            <Badge tono="mor">Con error</Badge>
            <Lista items={fila.errores} tono="text-mor" />
          </>
        )}
        {fila.estado !== 'omitida' && <Lista items={fila.advertencias} tono="text-pend" />}
      </Td>
    </tr>
  );
}

function Lista({ items, tono }: { items: string[]; tono: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {items.map((e) => (
        <li key={e} className={`text-xs ${tono}`}>
          {e}
        </li>
      ))}
    </ul>
  );
}
