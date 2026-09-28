import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ETIQUETA_COLUMNA_PARCELAS, type FilaImportacionParcela, type ResultadoImportacionParcelas } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Tabla, Td, Th } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { metros, plural } from '@/lib/formato';
import { urlPlantillaParcelas, useImportarParcelas, useLoteos, usePrevisualizarImportacionParcelas } from './api';

/**
 * Importación de manzanas, lotes y superficies de un loteo, sin socios. Acepta la misma
 * planilla que el padrón. Dos pasos: primero se ve fila por fila qué va a pasar, y recién
 * con todo en orden se confirma, en una sola transacción.
 */
export function ImportarParcelasPage() {
  const navigate = useNavigate();
  const activo = useLoteoActivo();
  const loteos = useLoteos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [loteoId, setLoteoId] = useState<number | undefined>(activo.loteoId);
  const [previa, setPrevia] = useState<ResultadoImportacionParcelas | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const previsualizar = usePrevisualizarImportacionParcelas();
  const importar = useImportarParcelas();

  const analizar = (elegido: File | null, loteo: number | undefined) => {
    setPrevia(null);
    if (!elegido || !loteo) return;
    previsualizar.mutate({ archivo: elegido, loteoId: loteo }, { onSuccess: setPrevia, onError: (e) => toast.error(e.message) });
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
    if (!archivo || !loteoId) return;
    importar.mutate(
      { archivo, loteoId },
      {
        onSuccess: (r) => {
          const partes = [
            r.nuevas > 0 && plural(r.nuevas, 'lote creado', 'lotes creados'),
            r.actualizadas > 0 && plural(r.actualizadas, 'superficie actualizada', 'superficies actualizadas'),
          ].filter(Boolean);
          toast.success(partes.join(' · '));
          navigate('/parcelas');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const faltanColumnas = (previa?.columnasFaltantes.length ?? 0) > 0;
  const hayAlgo = !!previa && (previa.nuevas > 0 || previa.actualizadas > 0);
  const sePuedeImportar = !!previa && !faltanColumnas && previa.conError === 0 && hayAlgo;
  const nombreLoteo = loteos.data?.find((l) => l.id === loteoId)?.nombre;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/parcelas" className="hover:underline">
              Parcelas
            </Link>{' '}
            / Importar
          </>
        }
        titulo="Importar parcelas"
        acciones={
          <a
            href={urlPlantillaParcelas()}
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
            Un Excel (.xlsx) o un CSV con una fila por lote; sirve la misma base de datos de asociados. La primera fila son
            los encabezados. Obligatorias: {ETIQUETA_COLUMNA_PARCELAS.manzana} (o Sector) y {ETIQUETA_COLUMNA_PARCELAS.lote}.
            Opcionales: {ETIQUETA_COLUMNA_PARCELAS.superficie} y {ETIQUETA_COLUMNA_PARCELAS.descripcion}. Las demás columnas
            —socio, DNI, teléfono…— se ignoran.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
          <Field label="Loteo" htmlFor="loteo-importacion" requerido ayuda="Las manzanas y lotes que no existan se crean acá.">
            <Select
              id="loteo-importacion"
              value={loteoId ?? ''}
              onChange={(e) => cambiarLoteo(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Elegí un loteo</option>
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
          El código de cada lote se arma «manzana-lote», por ejemplo 7-1. Los lotes que ya existen no se duplican: si el
          archivo trae otra superficie, se actualiza. No se borra nada ni se tocan los titulares, así que reimportar el mismo
          archivo es seguro.
        </p>
      </Card>

      {!loteoId && archivo && (
        <div className="flex items-start gap-2.5 rounded-control bg-pend-fondo px-4 py-3 text-sm text-pend [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <AlertCircle />
          <span>Elegí el loteo para analizar el archivo.</span>
        </div>
      )}

      {previsualizar.isPending && <div className="h-40 animate-pulse rounded-card bg-superficie" />}

      {previa && faltanColumnas && (
        <div className="flex items-start gap-2.5 rounded-control bg-mor-fondo px-4 py-3 text-sm text-mor [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <AlertCircle />
          <span>
            <b>Al archivo le faltan columnas obligatorias:</b>{' '}
            {previa.columnasFaltantes.map((c) => ETIQUETA_COLUMNA_PARCELAS[c]).join(', ')}. Descargá la plantilla para ver
            los nombres que se esperan.
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
                  <Th>Manzana</Th>
                  <Th>Lote</Th>
                  <Th className="text-right">Superficie</Th>
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
              {previa.nuevas > 0 ? ` ${plural(previa.nuevas, 'lote')}` : ''}
              {previa.actualizadas > 0 ? `${previa.nuevas > 0 ? ' y' : ''} actualizar ${plural(previa.actualizadas, 'superficie')}` : ''}
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
            {previa.conError === 0 && !hayAlgo && (
              <span className="text-[13px] text-tenue">No hay nada nuevo: todos los lotes ya existen con la misma superficie.</span>
            )}
            {previa.conError === 0 && hayAlgo && nombreLoteo && (
              <span className="text-[13px] text-tenue">Todo se carga en {nombreLoteo}.</span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Resumen({ previa }: { previa: ResultadoImportacionParcelas }) {
  const datos = [
    { etiqueta: 'Filas leídas', valor: previa.total, tono: '' },
    { etiqueta: 'Lotes a crear', valor: previa.nuevas, tono: 'text-ok' },
    { etiqueta: 'Manzanas a crear', valor: previa.manzanasNuevas, tono: '' },
    { etiqueta: 'Superficies a actualizar', valor: previa.actualizadas, tono: '' },
    { etiqueta: 'Ya existían', valor: previa.sinCambios + previa.repetidas, tono: 'text-tenue' },
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

function Fila({ fila }: { fila: FilaImportacionParcela }) {
  return (
    <tr className={fila.estado === 'error' ? 'bg-mor-fondo/40' : undefined}>
      <Td className="tabular text-tenue">{fila.fila}</Td>
      <Td className="tabular">
        {fila.manzana || '—'}
        {fila.manzanaNueva && <span className="ml-1.5 text-xs text-tenue">(se crea)</span>}
      </Td>
      <Td className="tabular">{fila.lote || '—'}</Td>
      <Td className="text-right tabular">
        {fila.superficieM2 === null ? <span className="text-tenue">—</span> : metros(fila.superficieM2)}
      </Td>
      <Td>
        {fila.estado === 'nueva' && <Badge tono="ok">Se crea</Badge>}
        {fila.estado === 'actualiza' && (
          <>
            <Badge tono="pino">Se actualiza</Badge>
            <span className="mt-1 block text-xs text-tenue">
              Superficie actual: {fila.superficieAnterior == null ? 'sin cargar' : metros(fila.superficieAnterior)}
            </span>
          </>
        )}
        {fila.estado === 'sinCambios' && <Badge tono="baja">Ya existe</Badge>}
        {fila.estado === 'repetida' && (
          <>
            <Badge tono="baja">Se omite</Badge>
            <span className="mt-1 block text-xs text-tenue">El mismo lote ya aparece en la fila {fila.repetidaDe}</span>
          </>
        )}
        {fila.estado === 'error' && (
          <>
            <Badge tono="mor">Con error</Badge>
            <Lista items={fila.errores} tono="text-mor" />
          </>
        )}
        {fila.estado !== 'error' && <Lista items={fila.advertencias} tono="text-pend" />}
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
