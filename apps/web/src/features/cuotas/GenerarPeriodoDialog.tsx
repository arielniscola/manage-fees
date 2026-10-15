import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { etiquetaPeriodo, hoy, pesos, type SocioDetalle } from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { fecha, nombreCompleto, plural } from '@/lib/formato';
import { useGenerarCuotas, useVistaPreviaGeneracion } from './api';

/**
 * Genera las cuotas que falten hasta una fecha. Siempre muestra primero la vista previa:
 * la generación es idempotente, pero conviene ver qué se va a crear antes de crearlo.
 * Con un loteo activo en el sidebar, solo genera las de sus parcelas. Desde la ficha de un
 * socio genera solo las suyas: sirve para el que se dio de alta tarde.
 */
export function GenerarPeriodoDialog({
  abierto,
  onAbiertoChange,
  socio,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  socio?: SocioDetalle;
}) {
  const { loteoId: loteoActivo } = useLoteoActivo();
  // Desde la ficha manda el socio: sus parcelas pueden ser de cualquier loteo.
  const loteoId = socio ? undefined : loteoActivo;
  const [hasta, setHasta] = useState(hoy);
  const [desde, setDesde] = useState('');
  const filtros = { hasta, desde: desde || undefined, loteoId, socioId: socio?.id };
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(hasta) && (!desde || /^\d{4}-\d{2}$/.test(desde));
  const previa = useVistaPreviaGeneracion(filtros, abierto && valido);
  const generar = useGenerarCuotas();

  useEffect(() => {
    if (abierto) {
      setHasta(hoy());
      setDesde('');
    }
  }, [abierto]);

  const nada = previa.data && !previa.data.sinTarifa && previa.data.cuotas === 0;

  // Parcelas del socio que se le van a cobrar desde antes de que fueran suyas. Se permite,
  // pero conviene que quien genera lo vea. Por parcela cuenta su primera asignación.
  const primeras = new Map<number, SocioDetalle['asignaciones'][number]>();
  for (const a of [...(socio?.asignaciones ?? [])].sort((x, y) => x.desde.localeCompare(y.desde))) {
    if (!primeras.has(a.parcela.id)) primeras.set(a.parcela.id, a);
  }
  const retrotraidas = desde ? [...primeras.values()].filter((a) => a.desde > `${desde}-01`) : [];

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={socio ? 'Generar cuotas del socio' : 'Generar período'}
      descripcion={
        socio
          ? `Se crean las cuotas de las parcelas de ${nombreCompleto(socio)} y su cuota social, de los períodos que ya hayan empezado. Las que ya existen no se duplican.`
          : `Se crean las cuotas de cada parcela asignada${loteoId ? ' del loteo elegido' : ''} cuyo período ya haya empezado. Generar dos veces lo mismo no duplica nada.`
      }
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            {nada ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            cargando={generar.isPending}
            disabled={!previa.data || previa.data.sinTarifa || previa.data.cuotas === 0}
            onClick={() =>
              generar.mutate(
                { ...filtros, simular: false },
                {
                  onSuccess: (r) => {
                    toast.success(
                      socio
                        ? `Se generaron ${plural(r.cuotas, 'cuota')} para ${nombreCompleto(socio)}`
                        : `Se generaron ${plural(r.cuotas, 'cuota')} para ${plural(r.socios, 'socio')}`,
                    );
                    onAbiertoChange(false);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {previa.data && previa.data.cuotas > 0 ? `Generar ${plural(previa.data.cuotas, 'cuota')}` : 'Generar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Generar hasta"
            htmlFor="generar-hasta"
            ayuda="Se incluyen los períodos que hayan empezado en esta fecha o antes."
          >
            <Input id="generar-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="tabular" />
          </Field>
          <Field
            label="Cobrar desde (opcional)"
            htmlFor="generar-desde"
            ayuda={
              socio
                ? 'Genera también los meses anteriores a su asignación, desde este mes, aunque la parcela haya tenido otro titular.'
                : 'Genera también los meses anteriores a la asignación, desde este mes, a nombre del primer titular.'
            }
          >
            <Input id="generar-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="tabular" />
          </Field>
        </div>

        {retrotraidas.length > 0 && (
          <Aviso tono="info" icono={<Info />}>
            {retrotraidas.length === 1 ? 'La parcela ' : 'Las parcelas '}
            {retrotraidas.map((a) => `${a.parcela.etiqueta} (desde el ${fecha(a.desde)})`).join(', ')}{' '}
            {retrotraidas.length === 1 ? 'se le asignó' : 'se le asignaron'} después de que empezara{' '}
            {etiquetaPeriodo(desde, 'MENSUAL')}. Las cuotas de esos meses se generan igual a su nombre, aunque todavía no era
            titular. Si otro titular ya tiene la de algún período, esa no se duplica; si la tiene anulada, se reemplaza.
          </Aviso>
        )}

        {previa.data && previa.data.parcelasSinImporte > 0 && (
          <Aviso tono="pend" icono={<AlertCircle />}>
            {plural(previa.data.parcelasSinImporte, 'parcela')} de loteos que cobran por parcela no{' '}
            {previa.data.parcelasSinImporte === 1 ? 'tiene' : 'tienen'} su importe cargado, así que no se{' '}
            {previa.data.parcelasSinImporte === 1 ? 'genera' : 'generan'}. Cargalo en cada parcela.
          </Aviso>
        )}

        {previa.isPending ? (
          <p className="py-6 text-center text-sm text-tenue">Calculando…</p>
        ) : previa.isError ? (
          <Aviso tono="mor" icono={<AlertCircle />}>{previa.error.message}</Aviso>
        ) : previa.data.sinTarifa ? (
          <Aviso tono="pend" icono={<AlertCircle />}>
            Todavía no hay ninguna tarifa configurada.{' '}
            <Link to="/configuracion/cuota" onClick={() => onAbiertoChange(false)} className="font-semibold underline">
              Configurar la cuota
            </Link>{' '}
            para poder generar.
          </Aviso>
        ) : previa.data.cuotas === 0 && previa.data.yaExistian === 0 ? (
          <Aviso tono="pend" icono={<AlertCircle />}>
            {socio && socio.asignaciones.length === 0
              ? 'El socio no tiene parcelas asignadas, así que no genera cuotas.'
              : `No hay cuotas para este rango: ${socio ? 'el socio no tenía parcelas asignadas' : 'ninguna parcela estaba asignada'} entonces.`}
            {!desde && ' Si se asignaron después, elegí desde qué mes cobrarlas en «Cobrar desde».'}
          </Aviso>
        ) : previa.data.cuotas === 0 ? (
          <Aviso tono="ok" icono={<CheckCircle2 />}>
            No hay nada pendiente: las {plural(previa.data.yaExistian, 'cuota')} de este rango ya estaban generadas.
          </Aviso>
        ) : (
          <>
            <div className="overflow-hidden rounded-control border border-borde">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Período</Th>
                    <Th>Tipo</Th>
                    <Th>Vence</Th>
                    <Th className="text-right">Cuotas</Th>
                    <Th className="text-right">Importe</Th>
                  </tr>
                </thead>
                <tbody>
                  {previa.data.periodos.map((p) => (
                    <tr key={`${p.periodo}-${p.origen}`}>
                      <Td className="font-medium first-letter:uppercase">{p.etiqueta}</Td>
                      <Td>
                        {p.origen === 'PARCELA' ? 'De parcela' : 'Social'}
                        <span className="block text-xs text-tenue">
                          {p.origen === 'PARCELA' ? 'una por parcela' : 'una por socio'}
                        </span>
                      </Td>
                      <Td className="tabular text-tenue">{fecha(p.vencimiento)}</Td>
                      <Td className="text-right tabular">{p.cantidad}</Td>
                      <Td className="text-right tabular">{pesos(p.importe)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-superficie-2 font-semibold">
                    <Td>Total</Td>
                    <Td />
                    <Td />
                    <Td className="text-right tabular">{previa.data.cuotas}</Td>
                    <Td className="text-right tabular">{pesos(previa.data.importe)}</Td>
                  </tr>
                </tbody>
              </Tabla>
            </div>
            <p className="text-[13px] text-tenue">
              {!socio && `Alcanza a ${plural(previa.data.socios, 'socio')}.`}
              {previa.data.reemplazadas > 0 &&
                ` Se ${previa.data.reemplazadas === 1 ? 'reemplaza 1 cuota anulada' : `reemplazan ${previa.data.reemplazadas} cuotas anuladas`} del titular anterior.`}
              {previa.data.yaExistian > 0 && ` Se saltean ${plural(previa.data.yaExistian, 'cuota')} que ya existían.`}
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Aviso({ tono, icono, children }: { tono: 'ok' | 'pend' | 'mor' | 'info'; icono: ReactNode; children: ReactNode }) {
  const estilos = {
    ok: 'bg-ok-fondo text-ok',
    info: 'bg-superficie-2 text-tinta',
    pend: 'bg-pend-fondo text-pend',
    mor: 'bg-mor-fondo text-mor',
  }[tono];
  return (
    <div className={`flex items-start gap-2.5 rounded-control px-4 py-3 text-sm ${estilos} [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0`}>
      {icono}
      <span>{children}</span>
    </div>
  );
}
