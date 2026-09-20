import { useState } from 'react';
import { Link } from 'react-router';
import { pesos, type CuotaListItem, type SocioDetalle } from '@mf/shared';
import { Card, CardHeader, PieVerMas, Tabla, Td, Th, Vacio } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useCuotasDeSocio } from './api';
import { BadgeCuota } from './estados';

/** Claves de los dos grupos que no cuelgan de ninguna parcela. */
const SOCIAL = 'Cuota social';
const PLANES = 'Planes de pago';
/** Cuotas por grupo que se ven en la ficha; el resto queda para el modal. */
const VISIBLES = 5;

/**
 * Estado de cuenta del socio: la cuota social, que paga por ser socio, y después una
 * columna por cada parcela, que es el pago por la propiedad del terreno. Las cuotas de los
 * planes de pago van en un grupo aparte, porque no salen de ningún período.
 */
export function CuotasDelSocio({ socio }: { socio: SocioDetalle }) {
  const { data: cuotas, isPending, isError, error } = useCuotasDeSocio(socio.id);
  const [viendoTodas, setViendoTodas] = useState(false);

  if (isPending) {
    return (
      <Card className="overflow-hidden">
        <CardHeader titulo="Cuotas" />
        <div className="h-32 animate-pulse bg-superficie-2" />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="overflow-hidden">
        <CardHeader titulo="Cuotas" />
        <p className="px-6 py-8 text-center text-sm text-mor">{error.message}</p>
      </Card>
    );
  }

  const porParcela = agrupar(cuotas);
  const { deuda, pendientes } = socio.estadoCuenta;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Cuotas"
        descripcion={
          cuotas.length === 0
            ? undefined
            : pendientes === 0
              ? `${plural(cuotas.length, 'cuota')} · sin deuda`
              : `${plural(pendientes, 'cuota pendiente', 'cuotas pendientes')} · ${pesos(deuda)} de deuda`
        }
        acciones={
          cuotas.length > 0 && (
            <Link to={`/cuotas?q=${socio.numero}`} className="text-[13px] font-semibold text-pino-600 hover:underline">
              Ver en el listado
            </Link>
          )
        }
      />

      {cuotas.length === 0 ? (
        <Vacio
          titulo="Sin cuotas generadas"
          descripcion={
            socio.parcelas.length === 0
              ? 'El socio no tiene parcelas asignadas, así que todavía no genera cuota.'
              : 'Las cuotas se generan solas todos los días, o a mano desde «Generar período».'
          }
        />
      ) : (
        <>
          <GruposDeCuotas grupos={porParcela} limite={VISIBLES} />
          {porParcela.some((g) => g.cuotas.length > VISIBLES) && (
            <PieVerMas onClick={() => setViendoTodas(true)}>Ver las {cuotas.length} cuotas</PieVerMas>
          )}
          <Dialog
            abierto={viendoTodas}
            onAbiertoChange={setViendoTodas}
            ancho="lg"
            titulo="Todas las cuotas"
            descripcion={`${nombreCompleto(socio)} · ${plural(cuotas.length, 'cuota')}`}
          >
            <div className="-mx-6 -my-4">
              <GruposDeCuotas grupos={porParcela} />
            </div>
          </Dialog>
        </>
      )}
    </Card>
  );
}

type Grupo = { clave: string; etiqueta: string; cuotas: CuotaListItem[] };

/** Las cuotas repartidas por grupo. Con límite, cada grupo muestra solo sus más recientes. */
function GruposDeCuotas({ grupos, limite }: { grupos: Grupo[]; limite?: number }) {
  return (
    <div className="flex flex-col">
      {grupos.map(({ clave, etiqueta, cuotas }) => (
        <div key={clave} className="border-t border-borde first:border-t-0">
          <div className="flex items-baseline justify-between gap-4 bg-superficie-2 px-6 py-2.5">
            <span className="text-sm font-semibold tabular">
              {etiqueta === PLANES || etiqueta === SOCIAL ? etiqueta : `Parcela ${etiqueta}`}
            </span>
            <span className="text-xs tabular text-tenue">
              {limite !== undefined && cuotas.length > limite
                ? `${limite} de ${cuotas.length} cuotas`
                : plural(cuotas.length, 'cuota')}
            </span>
          </div>
          <Tabla>
            <thead className="sr-only">
              <tr>
                <Th>Período</Th>
                <Th>Vence</Th>
                <Th>Importe</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {cuotas.slice(0, limite).map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium first-letter:uppercase">{c.etiqueta}</Td>
                  <Td className="tabular text-tenue">Vence {fecha(c.vencimiento)}</Td>
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
        </div>
      ))}
    </div>
  );
}

/**
 * Las cuotas ya vienen ordenadas por período descendente; acá solo se reparten por parcela.
 * Se agrupa por id y no por código: el código solo es único dentro del sector, así que dos
 * parcelas de loteos distintos pueden llamarse igual y no hay que mezclarlas.
 */
function agrupar(cuotas: CuotaListItem[]): Grupo[] {
  const grupos = new Map<string, { etiqueta: string; cuotas: CuotaListItem[] }>();
  for (const c of cuotas) {
    // Ni la cuota social ni las de plan cuelgan de una parcela: cada una va en su grupo.
    const clave = c.origen === 'SOCIO' ? SOCIAL : c.origen === 'PLAN' ? PLANES : String(c.parcela?.id);
    const etiqueta = c.origen === 'SOCIO' ? SOCIAL : c.origen === 'PLAN' ? PLANES : (c.parcela?.etiqueta ?? PLANES);
    const actual = grupos.get(clave);
    if (actual) actual.cuotas.push(c);
    else grupos.set(clave, { etiqueta, cuotas: [c] });
  }
  // La social primero, después las parcelas en orden, y los planes de pago al final.
  const orden = (clave: string) => (clave === SOCIAL ? 0 : clave === PLANES ? 2 : 1);
  return [...grupos.entries()]
    .map(([clave, { etiqueta, cuotas }]) => ({ clave, etiqueta, cuotas }))
    .sort((a, b) => orden(a.clave) - orden(b.clave) || a.etiqueta.localeCompare(b.etiqueta));
}
