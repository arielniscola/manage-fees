import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftRight, FileText, Pencil } from 'lucide-react';
import { numeroRecibo, pesos, type ParcelaDetalle } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, ErrorCarga, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Encabezado } from '@/layout/AppLayout';
import { fecha, metros, nombreCompleto, plural } from '@/lib/formato';
import { BadgeCobro, CobroDetalleDialog } from '@/features/cobros/CobroDetalleDialog';
import { urlRecibo, useCobros } from '@/features/cobros/api';
import { BadgeCuota } from '@/features/cuotas/estados';
import { useCuotas } from '@/features/cuotas/api';
import { useParcela } from './api';
import { ParcelaFormDialog } from './ParcelasPage';
import { TransferirDialog } from './TransferirDialog';

/** Cuántas filas se muestran en las tarjetas de cuotas y pagos antes de mandar al listado. */
const ULTIMAS = 50;

/**
 * Ficha de la parcela: quién la tiene hoy, por qué manos pasó, qué debe y qué se le cobró.
 * Es la contracara de la ficha del socio, que mira lo mismo desde la otra punta.
 */
export function ParcelaDetallePage() {
  const { id } = useParams();
  const parcelaId = Number(id);
  const { data: parcela, isPending, isError, error, refetch } = useParcela(parcelaId);
  const [editando, setEditando] = useState(false);
  const [transfiriendo, setTransfiriendo] = useState(false);

  if (isError) return <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />;
  if (isPending) return <div className="h-40 animate-pulse rounded-card bg-superficie" />;

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/parcelas" className="hover:underline">
              Parcelas
            </Link>{' '}
            / Ficha
          </>
        }
        titulo={`Parcela ${parcela.codigo}`}
        acciones={
          <>
            {parcela.estado === 'asignada' && (
              <Button variante="secundario" onClick={() => setTransfiriendo(true)}>
                <ArrowLeftRight /> Transferir
              </Button>
            )}
            <Button onClick={() => setEditando(true)}>
              <Pencil /> Editar
            </Button>
          </>
        }
      />

      <Cabecera parcela={parcela} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <Titulares parcela={parcela} />
        <Transferencias parcela={parcela} />
      </div>

      <CuotasDeLaParcela parcela={parcela} />
      <PagosDeLaParcela parcela={parcela} />

      <ParcelaFormDialog parcela={editando ? parcela : null} onCerrar={() => setEditando(false)} />
      <TransferirDialog parcela={transfiriendo ? parcela : null} onCerrar={() => setTransfiriendo(false)} />
    </>
  );
}

function Cabecera({ parcela }: { parcela: ParcelaDetalle }) {
  const ubicacion = [parcela.sector?.loteo?.nombre ?? 'Sin loteo', parcela.sector?.nombre ?? 'Sin sector'].join(' · ');

  return (
    <Card className="flex flex-wrap items-center gap-6 px-7 py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-serif text-[26px] font-medium tabular">{parcela.codigo}</span>
          {parcela.estado === 'libre' ? <Badge tono="pend">Libre</Badge> : <Badge tono="ok">Asignada</Badge>}
        </div>
        <span className="text-sm text-tenue">
          {ubicacion}
          {parcela.superficieM2 !== null && ` · ${metros(parcela.superficieM2)}`}
          {parcela.descripcion && ` · ${parcela.descripcion}`}
        </span>
        {parcela.titular ? (
          <span className="text-sm">
            Titular:{' '}
            <Link to={`/socios/${parcela.titular.id}`} className="font-medium hover:underline">
              {nombreCompleto(parcela.titular)}
            </Link>
            <span className="tabular text-tenue"> · N° {parcela.titular.numero} · desde {fecha(parcela.titular.desde)}</span>
          </span>
        ) : (
          <span className="text-sm text-tenue">Sin titular</span>
        )}
      </div>

      <div className="flex items-start gap-8 pr-2">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Cobrado</span>
          <span className="font-serif text-[30px] font-medium tabular">{pesos(parcela.cobrado)}</span>
          <span className="text-xs text-tenue">histórico de la parcela</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">Deuda</span>
          <span className={`font-serif text-[30px] font-medium tabular ${parcela.estadoCuenta.deuda > 0 ? 'text-mor' : ''}`}>
            {pesos(parcela.estadoCuenta.deuda)}
          </span>
          {parcela.estadoCuenta.pendientes > 0 && (
            <span className="text-xs text-tenue">
              {plural(parcela.estadoCuenta.pendientes, 'cuota pendiente', 'cuotas pendientes')}
              {parcela.estadoCuenta.vencidas > 0 &&
                `, ${parcela.estadoCuenta.vencidas} vencida${parcela.estadoCuenta.vencidas === 1 ? '' : 's'}`}
            </span>
          )}
          {parcela.estadoCuenta.interes > 0 && (
            <span className="text-xs text-tenue">incluye {pesos(parcela.estadoCuenta.interes)} de interés</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function Titulares({ parcela }: { parcela: ParcelaDetalle }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Titulares"
        descripcion={parcela.asignaciones.length ? plural(parcela.asignaciones.length, 'titularidad', 'titularidades') : undefined}
      />
      {parcela.asignaciones.length === 0 ? (
        <Vacio titulo="Nunca estuvo asignada" descripcion="Se asigna desde la ficha del socio que la recibe." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Socio</Th>
              <Th>Desde</Th>
              <Th>Hasta</Th>
            </tr>
          </thead>
          <tbody>
            {parcela.asignaciones.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link to={`/socios/${a.socio.id}`} className="font-medium hover:underline">
                    {nombreCompleto(a.socio)}
                  </Link>
                  <span className="block text-xs tabular text-tenue">N° {a.socio.numero}</span>
                </Td>
                <Td className="tabular">
                  {fecha(a.desde)}
                  {a.recibidaDe && <span className="block text-xs text-tenue">recibida de {nombreCompleto(a.recibidaDe)}</span>}
                </Td>
                <Td className="tabular">
                  {a.hasta ? fecha(a.hasta) : <Badge tono="ok">Vigente</Badge>}
                  {a.transferidaA && <span className="block text-xs text-tenue">transferida a {nombreCompleto(a.transferidaA)}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Card>
  );
}

function Transferencias({ parcela }: { parcela: ParcelaDetalle }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Transferencias"
        descripcion={parcela.transferencias.length ? plural(parcela.transferencias.length, 'transferencia') : undefined}
      />
      {parcela.transferencias.length === 0 ? (
        <Vacio
          titulo="Sin transferencias"
          descripcion="Acá queda cada cambio de titular hecho con «Transferir», con su fecha y su motivo."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>De</Th>
              <Th>A</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {parcela.transferencias.map((t) => (
              <tr key={t.id}>
                <Td className="tabular">
                  {fecha(t.fecha)}
                  <span className="block text-xs text-tenue">la registró {t.registradaPor}</span>
                </Td>
                <Td>
                  <Link to={`/socios/${t.de.id}`} className="hover:underline">
                    {nombreCompleto(t.de)}
                  </Link>
                </Td>
                <Td>
                  <Link to={`/socios/${t.a.id}`} className="hover:underline">
                    {nombreCompleto(t.a)}
                  </Link>
                </Td>
                <Td className="max-w-[220px] truncate text-tenue">{t.motivo ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Card>
  );
}

function CuotasDeLaParcela({ parcela }: { parcela: ParcelaDetalle }) {
  const { data, isPending, isError, error } = useCuotas({ parcelaId: parcela.id, estado: 'todas', page: 1, pageSize: ULTIMAS });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Cuotas de la parcela"
        descripcion={
          data
            ? data.total > ULTIMAS
              ? `${plural(data.total, 'cuota')} · se muestran las ${ULTIMAS} más nuevas`
              : plural(data.total, 'cuota')
            : undefined
        }
      />
      {isPending ? (
        <div className="h-24 animate-pulse bg-superficie-2" />
      ) : isError ? (
        <p className="px-6 py-8 text-center text-sm text-mor">{error.message}</p>
      ) : data.items.length === 0 ? (
        <Vacio
          titulo="Sin cuotas generadas"
          descripcion="Las cuotas se generan por parcela y período, desde «Generar período» o solas todos los días."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Período</Th>
              <Th>Socio</Th>
              <Th>Vence</Th>
              <Th className="text-right">Importe</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium first-letter:uppercase">{c.etiqueta}</Td>
                <Td>
                  <Link to={`/socios/${c.socio.id}`} className="hover:underline">
                    {nombreCompleto(c.socio)}
                  </Link>
                </Td>
                <Td className="tabular text-tenue">{fecha(c.vencimiento)}</Td>
                <Td className="text-right tabular">
                  {pesos(c.importe + c.interes)}
                  {c.interes > 0 && <span className="block text-xs text-tenue">incluye {pesos(c.interes)} de interés</span>}
                </Td>
                <Td className="w-px whitespace-nowrap">
                  <BadgeCuota estado={c.estado} diasVencida={c.diasVencida} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Card>
  );
}

function PagosDeLaParcela({ parcela }: { parcela: ParcelaDetalle }) {
  const { data, isPending, isError, error } = useCobros({
    parcelaId: parcela.id,
    estado: 'todos',
    page: 1,
    pageSize: ULTIMAS,
  });
  const [detalle, setDetalle] = useState<number | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Pagos"
        descripcion="Cobros que cancelaron alguna cuota de esta parcela. El total del recibo puede incluir cuotas de otras."
      />
      {isPending ? (
        <div className="h-24 animate-pulse bg-superficie-2" />
      ) : isError ? (
        <p className="px-6 py-8 text-center text-sm text-mor">{error.message}</p>
      ) : data.items.length === 0 ? (
        <Vacio titulo="Todavía no se cobró nada" descripcion="Los pagos se registran desde la ficha del socio o desde Cobros." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Recibo</Th>
              <Th>Fecha</Th>
              <Th>Socio</Th>
              <Th className="text-right">Total del cobro</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-superficie-2" onClick={() => setDetalle(c.id)}>
                <Td className="font-semibold tabular">{numeroRecibo(c.numeroRecibo)}</Td>
                <Td className="tabular text-tenue">{fecha(c.fecha)}</Td>
                <Td>{nombreCompleto(c.socio)}</Td>
                <Td className="text-right tabular">{pesos(c.total)}</Td>
                <Td className="w-px whitespace-nowrap">
                  <BadgeCobro anulado={c.anulado} />
                </Td>
                <Td className="w-px">
                  <a
                    href={urlRecibo(c.id)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-tenue hover:bg-superficie-2 hover:text-tinta [&_svg]:size-4"
                    aria-label={`Ver recibo del cobro del ${fecha(c.fecha)}`}
                  >
                    <FileText />
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <CobroDetalleDialog cobroId={detalle} onCerrar={() => setDetalle(null)} />
    </Card>
  );
}
