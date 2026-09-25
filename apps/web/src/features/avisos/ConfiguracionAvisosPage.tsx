import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { AlertCircle, CheckCircle2, History, PlayCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  ETIQUETA_TIPO_AVISO,
  MARCAS,
  configuracionAvisosSchema,
  pesos,
  type ConfiguracionAvisos,
  type ConfiguracionAvisosCompleta,
  type ConfiguracionAvisosInput,
} from '@mf/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorCarga, Tabla, Td, Th } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Encabezado } from '@/layout/AppLayout';
import { nombreCompleto, plural } from '@/lib/formato';
import { useEjecutarAvisos, useGuardarConfiguracionAvisos, useProbarAviso, useVistaPreviaAvisos, useConfiguracionAvisos } from './api';

const enlace =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-borde bg-superficie px-[18px] text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 [&_svg]:size-4';

/**
 * Configuración de los avisos de vencimiento. El servidor SMTP se configura en el entorno,
 * no acá: las contraseñas de la casilla no tienen por qué pasar por la pantalla.
 */
export function ConfiguracionAvisosPage() {
  const { data: config, isPending, isError, error, refetch } = useConfiguracionAvisos();
  const [probando, setProbando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);

  return (
    <>
      <Encabezado
        antetitulo={
          <>
            <Link to="/configuracion" className="hover:underline">
              Configuración
            </Link>{' '}
            / Avisos
          </>
        }
        titulo="Avisos de vencimiento"
        acciones={
          <>
            <Link to="/configuracion/avisos/envios" className={enlace}>
              <History /> Historial de envíos
            </Link>
            <Button variante="secundario" onClick={() => setProbando(true)} disabled={!config?.smtpConfigurado}>
              <Send /> Enviar prueba
            </Button>
            <Button onClick={() => setEjecutando(true)} disabled={!config?.activo}>
              <PlayCircle /> Ejecutar ahora
            </Button>
          </>
        }
      />

      {isError ? (
        <ErrorCarga mensaje={error.message} onReintentar={() => void refetch()} />
      ) : isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-superficie" />
      ) : (
        <>
          <EstadoSmtp config={config} />
          <Formulario config={config} />
        </>
      )}

      <PruebaDialog abierto={probando} onAbiertoChange={setProbando} />
      <EjecutarDialog abierto={ejecutando} onAbiertoChange={setEjecutando} />
    </>
  );
}

function EstadoSmtp({ config }: { config: ConfiguracionAvisosCompleta }) {
  if (!config.smtpConfigurado) {
    return (
      <div className="flex items-start gap-2.5 rounded-control bg-pend-fondo px-4 py-3 text-sm text-pend [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        <AlertCircle />
        <span>
          <b>Falta configurar el correo saliente.</b> Hasta que el servidor tenga definido <code>SMTP_HOST</code> (y
          la casilla y contraseña correspondientes), los avisos no se pueden activar.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-borde bg-superficie px-4 py-3 text-sm">
      <CheckCircle2 className="size-4 text-ok" />
      <span className="text-tenue">
        Los correos salen desde <span className="font-medium text-tinta">{config.remitenteEmail ?? 'la casilla del servidor'}</span>
        {config.smtp && <span className="text-tenue"> · {config.smtp}</span>}
      </span>
      {config.activo ? <Badge tono="ok">Avisos activos</Badge> : <Badge tono="baja">Avisos apagados</Badge>}
    </div>
  );
}

function Formulario({ config }: { config: ConfiguracionAvisosCompleta }) {
  const guardar = useGuardarConfiguracionAvisos();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ConfiguracionAvisosInput, unknown, ConfiguracionAvisos>({
    resolver: zodResolver(configuracionAvisosSchema),
    defaultValues: config,
  });

  useEffect(() => reset(config), [config, reset]);

  const diasDespues = Number(watch('diasDespues'));

  const onSubmit = handleSubmit((datos) =>
    guardar.mutate(datos, {
      onSuccess: () => toast.success('Configuración guardada'),
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 px-7 py-6">
        <h2 className="font-serif text-xl font-medium">Cuándo se avisa</h2>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-pino-600" disabled={!config.smtpConfigurado} {...register('activo')} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Enviar avisos automáticamente</span>
            <span className="text-[13px] text-tenue">
              Con esto apagado no sale ningún correo, ni siquiera desde «Ejecutar ahora».
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Días antes del vencimiento"
            htmlFor="diasAntes"
            requerido
            error={errors.diasAntes?.message}
            ayuda="Aviso de próximo vencimiento"
          >
            <Input id="diasAntes" type="number" min={0} max={60} className="tabular" invalido={!!errors.diasAntes} {...register('diasAntes')} />
          </Field>
          <Field
            label="Días después del vencimiento"
            htmlFor="diasDespues"
            requerido
            error={errors.diasDespues?.message}
            ayuda={diasDespues === 0 ? 'En 0 no se avisa por cuota vencida' : 'Aviso de cuota vencida'}
          >
            <Input id="diasDespues" type="number" min={0} max={180} className="tabular" invalido={!!errors.diasDespues} {...register('diasDespues')} />
          </Field>
          <Field label="Hora de envío" htmlFor="horaEnvio" requerido error={errors.horaEnvio?.message} ayuda="Hora de Argentina">
            <Select id="horaEnvio" invalido={!!errors.horaEnvio} {...register('horaEnvio')}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre del remitente"
            htmlFor="remitenteNombre"
            error={errors.remitenteNombre?.message}
            ayuda="Lo que ve el socio como nombre de quien le escribe"
          >
            <Input id="remitenteNombre" placeholder="Tesorería de la cooperativa" invalido={!!errors.remitenteNombre} {...register('remitenteNombre')} />
          </Field>
          <Field
            label="Copia oculta a"
            htmlFor="copiaOculta"
            error={errors.copiaOculta?.message}
            ayuda="Opcional: una casilla de la cooperativa recibe copia de cada aviso"
          >
            <Input id="copiaOculta" type="email" placeholder="tesoreria@cooperativa.org" invalido={!!errors.copiaOculta} {...register('copiaOculta')} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-5 px-7 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-xl font-medium">Textos de los correos</h2>
          <p className="text-[13px] text-tenue">
            Escribilos en texto común. Entre llaves dobles podés usar estas marcas, que se reemplazan al enviar:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(MARCAS).map(([marca, ayuda]) => (
              <span
                key={marca}
                title={ayuda}
                className="rounded-full bg-superficie-2 px-2.5 py-1 font-mono text-xs text-tenue"
              >{`{{${marca}}}`}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">
            {ETIQUETA_TIPO_AVISO.PROXIMO_VENCIMIENTO}
          </h3>
          <Field label="Asunto" htmlFor="asuntoProximo" requerido error={errors.asuntoProximo?.message}>
            <Input id="asuntoProximo" invalido={!!errors.asuntoProximo} {...register('asuntoProximo')} />
          </Field>
          <Field label="Mensaje" htmlFor="cuerpoProximo" requerido error={errors.cuerpoProximo?.message}>
            <Textarea id="cuerpoProximo" className="min-h-[200px] font-mono text-[13px]" invalido={!!errors.cuerpoProximo} {...register('cuerpoProximo')} />
          </Field>
        </div>

        <div className="flex flex-col gap-4 border-t border-borde pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-tenue">
            {ETIQUETA_TIPO_AVISO.CUOTA_VENCIDA}
          </h3>
          <Field label="Asunto" htmlFor="asuntoVencida" requerido error={errors.asuntoVencida?.message}>
            <Input id="asuntoVencida" invalido={!!errors.asuntoVencida} {...register('asuntoVencida')} />
          </Field>
          <Field label="Mensaje" htmlFor="cuerpoVencida" requerido error={errors.cuerpoVencida?.message}>
            <Textarea id="cuerpoVencida" className="min-h-[200px] font-mono text-[13px]" invalido={!!errors.cuerpoVencida} {...register('cuerpoVencida')} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {isDirty && <span className="text-[13px] text-tenue">Hay cambios sin guardar</span>}
        <Button type="submit" cargando={guardar.isPending} disabled={!isDirty}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function PruebaDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [tipo, setTipo] = useState<'PROXIMO_VENCIMIENTO' | 'CUOTA_VENCIDA'>('PROXIMO_VENCIMIENTO');
  const probar = useProbarAviso();

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho="sm"
      titulo="Enviar un correo de prueba"
      descripcion="Va con datos inventados y el asunto marcado como prueba. Sirve para ver cómo llega el mensaje y comprobar que el servidor de correo funciona."
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button
            cargando={probar.isPending}
            disabled={!email}
            onClick={() =>
              probar.mutate(
                { email, tipo },
                {
                  onSuccess: () => {
                    toast.success(`Correo de prueba enviado a ${email}`);
                    onAbiertoChange(false);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            <Send /> Enviar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Enviar a" htmlFor="email-prueba" requerido>
          <Input
            id="email-prueba"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
        </Field>
        <Field label="Qué plantilla probar" htmlFor="tipo-prueba">
          <Select id="tipo-prueba" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="PROXIMO_VENCIMIENTO">{ETIQUETA_TIPO_AVISO.PROXIMO_VENCIMIENTO}</option>
            <option value="CUOTA_VENCIDA">{ETIQUETA_TIPO_AVISO.CUOTA_VENCIDA}</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function EjecutarDialog({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const previa = useVistaPreviaAvisos(abierto);
  const ejecutar = useEjecutarAvisos();
  const nada = previa.data && previa.data.destinatarios.length === 0;

  return (
    <Dialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo="Ejecutar los avisos de hoy"
      descripcion="Es lo mismo que hace el proceso automático. Correrlo dos veces el mismo día no manda el correo dos veces."
      pie={
        <>
          <Button variante="secundario" onClick={() => onAbiertoChange(false)}>
            {nada ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            cargando={ejecutar.isPending}
            disabled={!previa.data || previa.data.destinatarios.length === 0}
            onClick={() =>
              ejecutar.mutate(undefined, {
                onSuccess: (r) => {
                  toast.success(
                    `${plural(r.enviados, 'aviso')} enviados${r.fallidos ? `, ${r.fallidos} con error` : ''}${r.sinEmail ? `, ${r.sinEmail} sin email` : ''}`,
                  );
                  onAbiertoChange(false);
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Enviar los avisos
          </Button>
        </>
      }
    >
      {previa.isPending ? (
        <p className="py-6 text-center text-sm text-tenue">Calculando…</p>
      ) : previa.isError ? (
        <p className="py-6 text-center text-sm text-mor">{previa.error.message}</p>
      ) : previa.data.inactivo ? (
        <p className="rounded-control bg-pend-fondo px-4 py-4 text-sm text-pend">
          Los avisos están apagados. Activalos arriba para poder enviarlos.
        </p>
      ) : previa.data.sinSmtp ? (
        <p className="rounded-control bg-pend-fondo px-4 py-4 text-sm text-pend">
          El servidor no tiene correo saliente configurado.
        </p>
      ) : previa.data.destinatarios.length === 0 ? (
        <p className="rounded-control bg-ok-fondo px-4 py-4 text-center text-sm text-ok">
          Hoy no hay a quién avisar: ninguna cuota vence ni venció en los días configurados.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tenue">
            {plural(previa.data.destinatarios.length, 'socio')} recibirían un correo: {previa.data.proximos} por próximo
            vencimiento y {previa.data.vencidas} por cuota vencida.
          </p>
          <div className="max-h-[300px] overflow-y-auto overflow-x-auto rounded-control border border-borde">
            <Tabla>
              <thead>
                <tr>
                  <Th>Socio</Th>
                  <Th>Aviso</Th>
                  <Th>Email</Th>
                  <Th className="text-right">Cuotas</Th>
                  <Th className="text-right">Importe</Th>
                </tr>
              </thead>
              <tbody>
                {previa.data.destinatarios.map((d) => (
                  <tr key={`${d.socio.id}-${d.tipo}`}>
                    <Td>
                      <span className="font-medium">{nombreCompleto(d.socio)}</span>
                      <span className="block text-xs tabular text-tenue">N° {d.socio.numero}</span>
                    </Td>
                    <Td className="text-[13px]">{ETIQUETA_TIPO_AVISO[d.tipo]}</Td>
                    <Td className="text-[13px]">
                      {d.email ?? <Badge tono="pend">Sin email</Badge>}
                    </Td>
                    <Td className="text-right tabular">{d.cantidadCuotas}</Td>
                    <Td className="text-right tabular">{pesos(d.importe)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        </div>
      )}
    </Dialog>
  );
}
