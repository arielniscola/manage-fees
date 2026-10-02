import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  aCentavos,
  asignacionLiberarSchema,
  hoy,
  pesos,
  socioBajaSchema,
  type AsignacionDeSocio,
  type AsignacionLiberar,
  type AsignacionLiberarInput,
  type SocioBaja,
  type SocioBajaInput,
  type SocioDetalle,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { useLoteoActivo } from '@/layout/loteo-activo';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fecha, nombreCompleto } from '@/lib/formato';
import { useDebounce } from '@/lib/hooks';
import { useLoteos, useParcelas } from '../parcelas/api';
import { useAsignarParcela, useBajaSocio, useLiberarParcela } from './api';

interface DialogoSocio {
  socio: SocioDetalle;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
}

export function BajaSocioDialog({ socio, abierto, onAbiertoChange }: DialogoSocio) {
  const baja = useBajaSocio(socio.id);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<SocioBajaInput, unknown, SocioBaja>({
    resolver: zodResolver(socioBajaSchema),
    defaultValues: { fechaBaja: hoy(), motivo: '' },
  });

  useEffect(() => {
    if (abierto) reset({ fechaBaja: hoy(), motivo: '' });
  }, [abierto, reset]);

  const onSubmit = handleSubmit((datos) =>
    baja.mutate(datos, {
      onSuccess: () => {
        toast.success(`${nombreCompleto(socio)} quedó dado de baja`);
        onAbiertoChange(false);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.field === 'fechaBaja') setError('fechaBaja', { message: e.message });
        else toast.error(e.message);
      },
    }),
  );

  const n = socio.parcelas.length;
  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo="Dar de baja al socio"
      ancho="sm"
      descripcion={
        n > 0
          ? `Se van a liberar ${n === 1 ? 'su parcela' : `sus ${n} parcelas`} (${socio.parcelas.map((p) => p.etiqueta).join(', ')}) con la misma fecha.`
          : 'El socio no tiene parcelas vigentes.'
      }
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>Cancelar</Button>
          <Button form="form-baja" type="submit" variante="peligro" cargando={baja.isPending}>Dar de baja</Button>
        </>
      }
    >
      <form id="form-baja" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Fecha de baja" htmlFor="fechaBaja" requerido error={errors.fechaBaja?.message}>
          <Input id="fechaBaja" type="date" invalido={!!errors.fechaBaja} {...register('fechaBaja')} />
        </Field>
        <Field label="Motivo" htmlFor="motivo" error={errors.motivo?.message}>
          <Input id="motivo" placeholder="Opcional" {...register('motivo')} />
        </Field>
      </form>
    </Dialog>
  );
}

const CAMPOS_ASIGNACION = ['parcelaId', 'desde', 'anticipo.importe', 'anticipo.vencimiento'] as const;
type CampoAsignacion = (typeof CAMPOS_ASIGNACION)[number];

export function AsignarParcelaDialog({ socio, abierto, onAbiertoChange }: DialogoSocio) {
  const asignar = useAsignarParcela(socio.id);
  const [texto, setTexto] = useState('');
  const [parcelaId, setParcelaId] = useState<number | null>(null);
  const [desde, setDesde] = useState(hoy());
  const [importeAnticipo, setImporteAnticipo] = useState('');
  const [vencimientoAnticipo, setVencimientoAnticipo] = useState(hoy());
  const [errores, setErrores] = useState<Partial<Record<CampoAsignacion, string>>>({});
  const q = useDebounce(texto);
  const { loteoId } = useLoteoActivo();
  const libres = useParcelas({ estado: 'libre', q: q || undefined, loteoId, pageSize: 8 }, { enabled: abierto });
  const { data: loteos = [] } = useLoteos();

  // Si el loteo de la parcela elegida cobra anticipo de entrada, se pide junto con la asignación.
  const elegida = libres.data?.items.find((p) => p.id === parcelaId);
  const loteoElegido = loteos.find((l) => l.id === elegida?.sector?.loteo?.id);

  useEffect(() => {
    if (abierto) {
      setTexto('');
      setParcelaId(null);
      setDesde(hoy());
      setVencimientoAnticipo(hoy());
      setErrores({});
    }
  }, [abierto]);

  // Al cambiar de parcela se precarga el importe sugerido de su loteo.
  useEffect(() => {
    setImporteAnticipo(loteoElegido?.importeAnticipo ? pesos(loteoElegido.importeAnticipo, { simbolo: false }) : '');
  }, [loteoElegido]);

  const cambiarDesde = (valor: string) => {
    // El vencimiento acompaña a la fecha de asignación mientras nadie lo haya movido a mano.
    if (vencimientoAnticipo === desde) setVencimientoAnticipo(valor);
    setDesde(valor);
  };

  const confirmar = () => {
    if (!parcelaId) return setErrores({ parcelaId: 'Elegí una parcela' });
    if (!desde) return setErrores({ desde: 'Ingresá una fecha' });
    let anticipo: { importe: string; vencimiento: string } | undefined;
    if (loteoElegido?.cobraAnticipo) {
      const importe = aCentavos(importeAnticipo);
      if (importe === null || importe <= 0) return setErrores({ 'anticipo.importe': 'Ingresá el importe del anticipo' });
      if (!vencimientoAnticipo) return setErrores({ 'anticipo.vencimiento': 'Ingresá el vencimiento' });
      if (vencimientoAnticipo < desde) return setErrores({ 'anticipo.vencimiento': 'No puede ser anterior a la asignación' });
      anticipo = { importe: importeAnticipo, vencimiento: vencimientoAnticipo };
    }
    asignar.mutate(
      { parcelaId, desde, anticipo },
      {
        onSuccess: () => {
          const cual = libres.data?.items.find((p) => p.id === parcelaId)?.etiqueta;
          toast.success(`Parcela ${cual ?? ''} asignada a ${nombreCompleto(socio)}`);
          onAbiertoChange(false);
        },
        onError: (e) => {
          const campo = e instanceof ApiError ? CAMPOS_ASIGNACION.find((c) => c === e.field) : undefined;
          if (campo) setErrores({ [campo]: e.message });
          else toast.error(e.message);
        },
      },
    );
  };

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo="Asignar parcela"
      descripcion={`A ${nombreCompleto(socio)}. Solo se muestran parcelas libres${loteoId ? ' del loteo activo' : ''}.`}
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} cargando={asignar.isPending}>Asignar parcela</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tenue" />
            <Input
              id="buscar-parcela-libre"
              type="search"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por código o sector"
              className="pl-10"
              aria-label="Buscar parcela libre"
            />
          </div>
          <div role="listbox" aria-label="Parcelas libres" className="flex max-h-72 flex-col overflow-y-auto rounded-control border border-borde">
            {libres.isPending ? (
              <p className="px-4 py-6 text-center text-sm text-tenue">Buscando parcelas…</p>
            ) : libres.isError ? (
              <p className="px-4 py-6 text-center text-sm text-mor">{libres.error.message}</p>
            ) : libres.data.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-tenue">
                {q ? 'No hay parcelas libres con ese código.' : 'No hay parcelas libres. Cargá una desde Parcelas.'}
              </p>
            ) : (
              libres.data.items.map((p, i) => {
                const elegida = p.id === parcelaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={elegida}
                    onClick={() => {
                      setParcelaId(p.id);
                      setErrores({});
                    }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
                      i > 0 && 'border-t border-borde',
                      elegida ? 'bg-pino-50' : 'hover:bg-superficie-2',
                    )}
                  >
                    <span className="w-40 truncate font-semibold tabular">{p.etiqueta}</span>
                    <span className="flex-1 text-tenue">{[p.sector?.nombre, p.descripcion].filter(Boolean).join(' · ') || '—'}</span>
                    {elegida && <Check className="size-4 text-pino-600" />}
                  </button>
                );
              })
            )}
          </div>
          {libres.data && libres.data.total > libres.data.items.length && (
            <span className="text-xs text-tenue">Mostrando {libres.data.items.length} de {libres.data.total}. Escribí para filtrar.</span>
          )}
          {errores.parcelaId && <span role="alert" className="text-xs text-mor">{errores.parcelaId}</span>}
        </div>
        <Field label="Asignada desde" htmlFor="desde" requerido error={errores.desde} ayuda={`No puede ser anterior al alta del socio (${fecha(socio.fechaAlta)})`}>
          <Input id="desde" type="date" value={desde} min={socio.fechaAlta} onChange={(e) => cambiarDesde(e.target.value)} invalido={!!errores.desde} />
        </Field>
        {loteoElegido?.cobraAnticipo && (
          <div className="grid grid-cols-1 gap-4 rounded-control border border-borde bg-superficie-2 p-4 sm:grid-cols-2">
            <p className="text-[13px] text-tenue sm:col-span-2">
              El loteo {loteoElegido.nombre} cobra anticipo de entrada. Se genera como una cuota más del socio.
            </p>
            <Field label="Importe del anticipo" htmlFor="anticipo-importe" requerido error={errores['anticipo.importe']}>
              <Input
                id="anticipo-importe"
                inputMode="decimal"
                className="tabular"
                placeholder="0,00"
                value={importeAnticipo}
                onChange={(e) => setImporteAnticipo(e.target.value)}
                invalido={!!errores['anticipo.importe']}
              />
            </Field>
            <Field label="Vencimiento" htmlFor="anticipo-vencimiento" requerido error={errores['anticipo.vencimiento']}>
              <Input
                id="anticipo-vencimiento"
                type="date"
                value={vencimientoAnticipo}
                min={desde}
                onChange={(e) => setVencimientoAnticipo(e.target.value)}
                invalido={!!errores['anticipo.vencimiento']}
              />
            </Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function LiberarParcelaDialog({ asignacion, onCerrar }: { asignacion: AsignacionDeSocio | null; onCerrar: () => void }) {
  const liberar = useLiberarParcela();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<AsignacionLiberarInput, unknown, AsignacionLiberar>({
    resolver: zodResolver(asignacionLiberarSchema),
    defaultValues: { hasta: hoy() },
  });

  useEffect(() => {
    if (asignacion) reset({ hasta: hoy() });
  }, [asignacion, reset]);

  const onSubmit = handleSubmit((datos) => {
    if (!asignacion) return;
    liberar.mutate(
      { asignacionId: asignacion.id, ...datos },
      {
        onSuccess: () => {
          toast.success(`Parcela ${asignacion.parcela.etiqueta} liberada`);
          onCerrar();
        },
        onError: (e) => {
          if (e instanceof ApiError && e.field === 'hasta') setError('hasta', { message: e.message });
          else toast.error(e.message);
        },
      },
    );
  });

  return (
    <Dialog
      abierto={!!asignacion}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={`Liberar parcela ${asignacion?.parcela.etiqueta ?? ''}`}
      ancho="sm"
      descripcion="La parcela queda libre para asignarla a otro socio. El historial se conserva."
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button form="form-liberar" type="submit" cargando={liberar.isPending}>Liberar parcela</Button>
        </>
      }
    >
      <form id="form-liberar" onSubmit={onSubmit} noValidate>
        <Field label="Liberada el" htmlFor="hasta" requerido error={errors.hasta?.message} ayuda={asignacion ? `Asignada desde el ${fecha(asignacion.desde)}` : undefined}>
          <Input id="hasta" type="date" min={asignacion?.desde} invalido={!!errors.hasta} {...register('hasta')} />
        </Field>
      </form>
    </Dialog>
  );
}
