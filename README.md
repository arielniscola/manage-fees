# Gestión de socios

Sistema de gestión de socios, parcelas y cuota social.

- `apps/web`: React + Vite + Tailwind (sistema visual «Pino y Papel», ver `design/`)
- `apps/api`: NestJS + Prisma + PostgreSQL
- `packages/shared`: esquemas Zod y tipos compartidos entre web y API

## Primeros pasos

Requisitos: Node 22 y Docker.

```bash
npm install
docker compose up -d                 # PostgreSQL 16 en el puerto 5433
cp apps/api/.env.example apps/api/.env
npm run build:shared
npm run db:migrate
npm run db:seed                      # opcional: 1 loteo, 3 sectores, 36 parcelas, 6 socios y 2 tarifas

# Primer superadmin (muestra una contraseña temporal si no definís SUPERADMIN_PASSWORD)
npm run usuarios:superadmin -w @mf/api -- --usuario tesoreria --email tesoreria@club.org --nombre "Tesorería"
```

Si se pierde el acceso de todos los superadmins, el mismo comando con `--forzar` y el email
de un usuario existente lo vuelve superadmin y le asigna una contraseña temporal nueva.

Al sistema se entra con el **nombre de usuario**, no con el email. El email queda para
contacto y avisos.

Para desarrollar, en dos terminales:

```bash
npm run dev:api    # http://localhost:3000/api
npm run dev:web    # http://localhost:5173
```

Si cambiás algo en `packages/shared`, volvé a correr `npm run build:shared`
(o dejá `npm run dev -w @mf/shared` corriendo).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run typecheck` | Verifica tipos de shared, API y web |
| `npm test` | Tests de los esquemas de validación |
| `npm run build` | Build de producción de todo el monorepo |
| `npm run db:migrate` | Aplica las migraciones pendientes |

## Usuarios y acceso

- **Administrador:** usa el sistema (socios, parcelas y los módulos que se sumen).
- **Superadmin:** además gestiona usuarios: alta, edición, rol, desactivación y contraseñas temporales.
- Toda la API requiere sesión, salvo `POST /api/auth/login`. La sesión es una cookie httpOnly de 12 horas que se renueva con el uso.
- Los usuarios nuevos o con contraseña restablecida deben cambiarla antes de usar el sistema.
- Desactivar un usuario o restablecer su contraseña cierra sus sesiones en el momento.
- Nadie puede desactivarse ni cambiarse el rol a sí mismo, y siempre queda al menos un superadmin activo.
- **El ingreso es por nombre de usuario y contraseña.** El username se guarda siempre en minúsculas, así que «Tesoreria» y «tesoreria» son el mismo usuario y no pueden coexistir. El email es único también, pero solo para contacto.
- Un usuario inexistente, uno desactivado y una contraseña incorrecta dan el mismo mensaje: desde afuera no se puede averiguar qué usuarios existen.
- Login: 5 intentos fallidos por usuario (o 30 por IP) bloquean 15 minutos. Un ingreso correcto borra el contador de ese usuario; el de la IP se mantiene.
- El contador **vive en memoria del proceso**: si quedaste bloqueado y no querés esperar los 15 minutos, reiniciá la API (`npm run dev:api` se reinicia solo al guardar cualquier archivo). No hay nada que borrar en la base ni en el navegador.
- Detrás de un proxy, definí `TRUST_PROXY` para que se registre la IP real.

| Método | Ruta | Quién |
| --- | --- | --- |
| POST | `/api/auth/login` · `/api/auth/logout` | Público · con sesión |
| GET | `/api/auth/yo` | Con sesión |
| POST | `/api/auth/cambiar-password` | Con sesión |
| GET · POST · PATCH | `/api/usuarios[/:id]` | Superadmin |
| POST | `/api/usuarios/:id/desactivar` · `/activar` · `/restablecer-password` | Superadmin |

## API (etapa 1)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/socios?q=&estado=activo\|baja\|todos&page=` | Listado y búsqueda por nombre, DNI, N° o parcela |
| GET | `/api/socios/:id` | Ficha con historial de parcelas |
| POST | `/api/socios` | Alta (el N° se asigna solo si no se indica) |
| PATCH | `/api/socios/:id` | Modificación |
| POST | `/api/socios/:id/baja` | Baja: libera sus parcelas con la misma fecha |
| POST | `/api/socios/:id/reactivar` | Reactivación |
| POST | `/api/socios/:id/asignaciones` | Asignar una parcela libre |
| POST | `/api/asignaciones/:id/liberar` | Liberar una parcela |
| GET | `/api/parcelas/:id/transferencia/deuda?fecha=` | Lo que la parcela debe a esa fecha: las cuotas que quedan con el titular saliente |
| POST | `/api/parcelas/:id/transferir` | `{ aSocioId, fecha?, motivo?, plan? }`. Cambia el titular y deja el registro. Con deuda, `plan` es obligatorio |
| GET | `/api/transferencias?q=&socioId=&parcelaId=` | Historial de transferencias |
| GET | `/api/socios/:id/transferencias` | Transferencias en las que participó el socio |
| GET | `/api/parcelas?q=&estado=libre\|asignada\|todas&sectorId=` | Listado de parcelas con titular |
| GET · POST · PATCH · DELETE | `/api/sectores[/:id]` | ABM de sectores (solo se eliminan los que no tienen parcelas) |
| GET · POST · PATCH · DELETE | `/api/loteos[/:id]` | ABM de loteos (solo se eliminan los que no tienen sectores) |
| GET | `/api/parcelas/:id` | Ficha de la parcela: titulares, transferencias, deuda con interés y lo cobrado |
| POST · PATCH · DELETE | `/api/parcelas[/:id]` | ABM (solo se eliminan parcelas nunca asignadas) |

## API (etapa 2)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/tarifas?alcance=SOCIO\|PARCELA` | Historial de tarifas, de la más nueva a la más vieja. Sin `alcance` vienen las de las dos cuotas |
| POST | `/api/tarifas` | Nueva tarifa: alcance, importe, periodicidad, día de vencimiento y mes de vigencia |
| PATCH · DELETE | `/api/tarifas/:id` | Solo sobre una tarifa que todavía no generó cuotas |
| GET | `/api/cuotas?q=&estado=pendiente\|vencida\|pagada\|anulada\|todas&socioId=&parcelaId=&periodo=` | Listado paginado |
| GET | `/api/socios/:id/cuotas` | Cuotas del socio, sin paginar, para la ficha |
| POST | `/api/cuotas/generar` | `{ hasta?, simular? }`. Con `simular` devuelve la vista previa sin escribir |
| POST | `/api/cuotas/:id/anular` | `{ motivo }` |

## API (etapa 3)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/cobros?q=&estado=vigentes\|anulados\|todos&socioId=&parcelaId=&desde=&hasta=&medio=` | Listado paginado, con el total cobrado del filtro. `parcelaId` trae los cobros que cancelaron alguna cuota de esa parcela |
| GET | `/api/cobros/:id` | Detalle con las cuotas que canceló |
| POST | `/api/cobros` | `{ socioId, fecha?, medio, cuotaIds[], observaciones? }`. Emite el recibo |
| POST | `/api/cobros/:id/anular` | `{ motivo }` |
| GET | `/api/cobros/:id/recibo.pdf[?descargar=1]` | El recibo en PDF, para ver o descargar |
| GET | `/api/socios/:id/cobros` | Historial de pagos del socio |

## API (etapa 4)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/socios?estado=moroso` | Socios activos con cuotas vencidas, del que más debe al que menos |
| GET | `/api/planes?q=&estado=vigente\|cumplido\|incumplido\|cancelado\|todos&socioId=` | Listado de planes |
| GET | `/api/planes/:id` | Detalle: cuotas del plan y deuda refinanciada |
| POST | `/api/planes` | `{ socioId, fecha?, cuotaIds[], cantidadCuotas, anticipo?, primerVencimiento, toleranciaVencidas?, observaciones? }` |
| POST | `/api/planes/:id/cancelar` | `{ motivo }` |
| GET | `/api/socios/:id/planes` | Planes del socio |
| GET | `/api/socios/:id/cuotas?estado=impaga` | Cuotas del socio sin paginar, para cobrar o refinanciar |
| POST | `/api/socios/importar/previsualizar` | Planilla en `multipart/form-data` (campo `archivo`). Analiza sin escribir nada |
| POST | `/api/socios/importar` | La misma planilla. Da de alta las filas nuevas y sus parcelas, todo en una transacción |
| GET | `/api/socios/importar/plantilla` | Plantilla CSV con los encabezados y dos filas de ejemplo |

## API (etapa 5)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET · PUT | `/api/avisos/configuracion` | Días antes y después, hora de envío, remitente y plantillas |
| POST | `/api/avisos/ejecutar` | `{ simular? }`. Con `simular` devuelve a quién le tocaría, sin enviar |
| POST | `/api/avisos/probar` | `{ email, tipo }`. Correo de muestra para probar el SMTP |
| GET | `/api/avisos/envios?q=&resultado=ENVIADO\|FALLIDO\|SIN_EMAIL&tipo=&desde=&hasta=` | Historial de envíos |

## API (etapa 6)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/panel?desde=&hasta=&meses=` | Resumen, evolución mensual y mayores deudas |
| GET | `/api/reportes/:tipo?formato=xlsx\|csv&desde=&hasta=` | Descarga de `socios`, `cobros`, `morosos` o `planes` |
| GET · PUT | `/api/configuracion/interes` | Interés por mora: si está activo, el día del mes y el porcentaje |

Los errores tienen siempre la forma `{ statusCode, message, field? }`.

## Reglas de negocio implementadas

- **Los socios son titulares o suplentes.** Un titular tiene o tuvo parcelas; un suplente está en lista de espera y es el candidato natural cuando una parcela se transfiere. Recibir una parcela —por asignación o transferencia— convierte al suplente en titular automáticamente, y no se puede pasar a suplente a alguien que tenga parcelas a su nombre.
- El DNI y el N° de socio son únicos. El DNI se guarda sin puntos.
- El **CUIT es opcional y único**, se guarda sin guiones y se le valida el dígito verificador con módulo 11: un CUIT mal tipeado se rechaza al cargarlo.
- El socio guarda además **fecha de nacimiento** (no puede ser futura), **estado civil** y tres tildes de documentación: confirmación, fotocopia del DNI y acta de matrimonio.
- La baja es lógica: el socio y su historial se conservan.
- Una parcela tiene como máximo una asignación vigente (índice único parcial en la base).
- Las fechas de asignación no pueden ser anteriores al alta del socio ni superponerse con el titular anterior.
- Una parcela con historial no se puede eliminar.

### Importación del padrón

- **Son dos pasos sobre el mismo archivo.** La previsualización dice fila por fila qué va a pasar y no escribe nada; la importación lo aplica en una sola transacción. Si al confirmar quedó alguna fila con error, no entra ninguna: el padrón no queda a medio cargar.
- **El socio que ya existe se omite, no se pisa.** El DNI es la identidad: reimportar el mismo archivo no duplica ni revierte cambios hechos en el sistema, y el resumen dice cuántos se omitieron y por qué.
- **Un socio con parcelas entra como titular y se le asignan desde su fecha de alta; uno sin parcelas queda como suplente**, que es la lista de espera.
- **Los encabezados se reconocen sin acentos, mayúsculas ni signos**, y cada columna acepta los nombres alternativos más comunes (`N° Socio`, `nro`, `D.N.I.`, `Fecha de Alta`…). Obligatorias: apellido, nombre y DNI. Sin número de socio se asigna el siguiente libre.
- Las fechas se escriben `31/12/2026` o `2026-12-31`; un año de dos dígitos se completa hacia atrás si el resultado sería futuro. Las parcelas van en una celda separadas por coma.
- **Una parcela se escribe con su código, y con su loteo adelante si hace falta** («Lavalle · 7-1»): el código solo es único dentro del sector, así que uno repetido entre loteos se rechaza pidiendo la forma larga.
- Se validan contra la base el DNI, el número de socio y el CUIT repetidos, que la parcela exista y que no esté ya asignada; y dentro del archivo, que no haya dos filas con el mismo DNI, número o parcela.
- El análisis de las filas vive en `@mf/shared` y usa el **mismo esquema que el alta a mano**, así que una planilla no puede meter un socio que el formulario rechazaría.

### Ficha de la parcela

- **La parcela tiene su propia ficha**, la contracara de la del socio: quién la tiene hoy, por qué manos pasó, qué debe y qué se le cobró. Se entra desde el código en el listado.
- **La deuda que muestra es la de la parcela, no la del titular:** un socio con tres parcelas debe por cada una, y en la ficha de cada una se ve solo lo suyo, con el interés por mora del día.
- **Lo cobrado es histórico y no se reparte:** son los renglones de cobro de sus cuotas, sin contar los cobros anulados. Un mismo recibo puede pagar cuotas de varias parcelas, así que el total del recibo que se lista puede ser mayor que lo que le tocó a esta.

### Transferencias de posesión

- **Una transferencia es una operación propia, no dos sueltas.** Cierra la titularidad del saliente, abre la del que entra y deja un registro que vincula las dos puntas, con la fecha, el motivo y qué usuario la registró. Todo en una transacción.
- **Una parcela con deuda no se entrega sin resolverla.** Antes de transferir se corrobora qué debe la parcela a esa fecha —las cuotas impagas de períodos ya empezados, que quedan con el titular saliente— y esa deuda se refinancia en un plan de pago suyo. El plan se firma y la parcela cambia de manos **en la misma transacción**: o pasan las dos cosas o no pasa ninguna. Si el socio prefiere pagar en vez de refinanciar, se registra el cobro y la transferencia deja de tener deuda que resolver.
- El plan lo firma **el que sale**, no el que recibe: la deuda es de quien era titular cuando esas cuotas se generaron. El que entra se lleva únicamente las cuotas de períodos que todavía no empezaron.
- El historial de la parcela muestra cada titularidad y, cuando corresponde, de quién la recibió y a quién la transfirió.
- **Las cuotas siguen la misma regla que la generación:** el período es de quien era titular cuando empezó. Las cuotas de períodos ya empezados quedan con el saliente —aunque estén impagas, se generaron cuando la parcela era suya— y las de períodos futuros que estaban impagas pasan al que entra. Una transferencia el día 1 del mes le da ese período completo al que entra. Las cuotas ya pagadas nunca se mueven.
- No se puede transferir una parcela sin titular (para eso está asignar), ni al mismo socio, ni a uno dado de baja, ni con una fecha anterior al inicio de la titularidad actual o al alta del socio que recibe.
- **El predio se organiza en tres niveles: Loteo > Sector > Parcela.** El loteo es el fraccionamiento («Lavalle»), el sector la manzana dentro de él («7», «A-01») y la parcela el lote. Renombrar un loteo o un sector se refleja en todo lo que cuelga de él, sin tocar nada más.
- **Los dos niveles de arriba son opcionales.** Una parcela puede quedar sin sector y un sector sin loteo, para poder cargar datos antes de tener el mapa completo.
- **El nombre del sector es único dentro de su loteo, no en todo el sistema:** la manzana 7 puede existir en dos loteos distintos. Los sectores sin loteo tampoco pueden repetir nombre entre ellos; cada caso tiene su índice parcial, porque en Postgres dos NULL no chocan.
- Los nombres de loteo y de sector no se diferencian solo por mayúsculas: «Lavalle» y «lavalle» son el mismo.
- Ni un loteo con sectores ni un sector con parcelas se eliminan: primero hay que vaciarlos.
- **El código de la parcela es único dentro de su sector, no en todo el sistema:** el lote 1 de la manzana 7 de Lavalle y el lote 1 de la manzana 7 de Maipú son dos parcelas distintas. Es la misma regla que rige para el nombre del sector dentro de su loteo, y la garantizan dos índices parciales: uno para las parcelas con sector y otro para las que todavía no lo tienen. La convención natural sigue siendo «manzana-lote»: `7-1`, `8-14`.
- **Donde el código viaja solo se muestra la etiqueta de la parcela**, «Lavalle · 7-1»: recibos, avisos, exportaciones, los chips de la ficha del socio. La arma `etiquetaParcela` en un único lugar; en las pantallas que ya tienen el loteo a la vista se sigue mostrando el código pelado.
- La parcela guarda su **superficie en metros cuadrados**, con hasta dos decimales.

### Loteo activo

- **El selector del sidebar acota toda la aplicación a un loteo.** Con uno elegido, socios, parcelas, sectores, cuotas, cobros, planes, el panel y los reportes muestran solo lo suyo; «Todos los loteos» vuelve a la vista completa.
- **Un socio pertenece a un loteo si tiene una parcela vigente en él.** Socio no cuelga de Loteo: la relación es Socio > Asignación > Parcela > Sector > Loteo. El criterio es estricto, así que un suplente o un socio sin parcela no aparece mientras haya un loteo activo, y un socio con parcelas en dos loteos aparece en los dos.
- **Cada cuota sigue a la parcela que la originó.** Las cuotas de un plan de pago no tienen parcela: esas siguen al socio, para que la deuda refinanciada no se pierda de vista. Los cobros y los planes también siguen al socio.
- La elección se guarda en el navegador, no en la URL: acompaña al usuario de una pantalla a otra sin ensuciar los filtros que cada listado sí publica en el link. Si el loteo activo se elimina, el selector vuelve solo a «Todos los loteos».
- Los reportes exportados dejan el loteo escrito en el título de la hoja, para que un archivo acotado no se confunda con uno completo.

### Interés por mora

- **El interés no genera una cuota aparte:** se calcula al vuelo sobre cada cuota impaga cada vez que se muestra la deuda, y recién queda congelado cuando el socio paga —el detalle del cobro y el recibo guardan el importe con el recargo incluido, y el recibo aclara cuánto de eso fue interés.
- **Es simple, no compuesto, y se aplica por cuota:** cada vez que llega el día configurado y la cuota sigue impaga, se le suma el porcentaje calculado sobre su importe original. Tres meses de mora al 5 % son 15 %, no 15,76 %.
- El día de aplicación se recorta al último día del mes en los meses más cortos, igual que el día de vencimiento de la tarifa.
- **Las cuotas de un plan de pago no devengan interés:** esa deuda ya se refinanció una vez y el plan tiene sus propias reglas de incumplimiento. Al firmar un plan, en cambio, cada cuota entra con el interés que tenía ese día: refinanciar congela la deuda del momento.
- Apagar el interés no borra nada, porque no hay nada guardado: la deuda vuelve a mostrarse por el importe de las cuotas.

### Cuota social

- **Cada período genera dos cuotas distintas:** la **cuota social**, una por socio, y la **cuota por parcela**, que es el pago por la propiedad del terreno y sale una por cada parcela asignada. Un socio con tres parcelas recibe cuatro cuotas por período: una social y tres de parcela.
- **Solo las genera el socio que tiene alguna parcela.** El suplente, que está en lista de espera, no paga ninguna de las dos. La social sigue la misma regla que la de parcela: cuenta quién tenía parcela cuando empezó el período, así que perder la última parcela a mitad del período no borra la social de ese período, y desde el siguiente ya no se genera.
- **Cada cuota tiene su propio historial de tarifas**, con su importe, su periodicidad y su día de vencimiento: la social puede ser mensual y la de parcela anual, o cambiar de precio en meses distintos. El mes de vigencia es único dentro de cada alcance, no entre los dos.
- La cuota de parcela se imputa al titular que tenía la parcela cuando empezó el período, así el historial se conserva si después cambia de manos. La social es del socio y no se transfiere con la parcela.
- En la base, el origen de una cuota es `PARCELA`, `SOCIO` o `PLAN`, y un check garantiza que cada uno traiga lo que le corresponde: la de parcela, su asignación; la social, solo su tarifa; la de plan, su plan. Dos índices parciales impiden duplicarlas: uno por parcela y período, otro por socio y período.
- **Los importes son enteros en centavos**, para que sumar cuotas y armar planes no arrastre errores de redondeo.
- **Un período se identifica por su primer mes (`AAAA-MM`)** y dura lo que indique la periodicidad. Los períodos de un año arrancan en enero y se suceden sin huecos, así que dos parcelas nunca quedan desfasadas.
- **El vencimiento es el día configurado del primer mes del período.** Un día 31 en un mes más corto cae en el último día del mes.
- **«Vencida» no se guarda.** En la base una cuota está *pendiente*, *pagada* o *anulada*; figura como vencida si está pendiente y su vencimiento ya pasó. El estado no depende de que corra ningún proceso.
- **La generación es idempotente.** Un cron diario (`CUOTAS_CRON`, 03:15 hora de Argentina por defecto; `off` lo desactiva) y el botón «Generar período» hacen exactamente lo mismo: recalculan qué falta y descartan lo que ya existe. El índice único parcela + período es la última red si los dos corren a la vez.
- **Las tarifas son históricas.** Cambiar el valor no edita la tarifa vigente: se carga una nueva con su mes de vigencia y solo afecta a los períodos que empiecen desde ahí. Una tarifa que ya generó cuotas no se puede editar ni eliminar, y no se acepta una que rija desde un mes ya generado.
- **Anular, no borrar.** Una cuota anulada queda como constancia con su motivo, deja de contar en la deuda y ocupa el lugar del período, así que la generación no la vuelve a crear. Una cuota pagada no se anula: se anula el cobro.

### Cobros y recibos

- **Un cobro cancela una o varias cuotas del mismo socio y emite un único recibo.** Las cuotas se pagan completas: no hay pagos parciales.
- **Todo pasa en una sola transacción:** marcar las cuotas, crear el cobro con su detalle y tomar el número de recibo. Nunca queda un recibo sin cuotas ni una cuota pagada sin recibo.
- **Las cuotas se marcan solo si siguen pendientes.** Si otra pantalla las cobró en el medio, el conteo no coincide y la transacción entera vuelve atrás con un error claro, en lugar de cobrar dos veces.
- **La numeración es correlativa y sin huecos.** El número sale de la tabla `Contador`, que se incrementa con un `UPDATE … RETURNING` dentro de la misma transacción: bloquea la fila mientras dura y, si algo falla después, el número vuelve atrás. Por eso no se usa una secuencia de Postgres, que sí dejaría huecos.
- **El recibo guarda un snapshot.** `Recibo.datos` congela socio, cuotas, importes y hasta el nombre del club (`CLUB_NOMBRE`), así reimprimirlo dentro de un año devuelve un PDF byte a byte idéntico aunque después cambien esos datos.
- **Anular un cobro no borra nada:** el recibo queda marcado como anulado (el PDF sale con el sello «ANULADO») y sus cuotas vuelven a pendiente. Una cuota que se anuló a mano en el medio se queda como está.
- El PDF se arma con **pdfkit**, no con `@react-pdf/renderer` como decía el plan: este último depende de `@react-pdf/hyphenate`, que solo publica ESM y no se puede cargar desde el build CommonJS de la API.

### Planes de pago

- **Refinanciar mueve la deuda, no la duplica.** Las cuotas elegidas pasan a `REFINANCIADA` y el plan genera cuotas nuevas con origen `PLAN` por exactamente el mismo total. Sin interés, según el supuesto del plan de trabajo.
- **Solo se refinancian cuotas sociales impagas.** Refinanciar una cuota que ya es de un plan dejaría ese plan a medio camino y la deuda contada dos veces.
- **Una cuota de plan no cuelga de ninguna parcela.** En la base, `asignacionId`, `parcelaId` y `tarifaId` son nulos y un check obliga a que cada cuota tenga uno u otro origen completo, nunca los dos ni ninguno.
- **El anticipo es la cuota número 0**, con vencimiento el día de la firma. Así la plata entra siempre por el mismo circuito de cobros y recibos, en lugar de ser un número suelto en el plan.
- **El importe se reparte sin perder centavos:** las primeras cuotas absorben el resto de la división, así la suma de las cuotas es exactamente la deuda refinanciada.
- **La simulación y la generación usan la misma función** (`simularPlan`, en `@mf/shared`), así lo que el socio ve antes de firmar es exactamente lo que se guarda.
- **El estado del plan se calcula**, igual que «vencida»: *cumplido* si no le quedan cuotas impagas, *incumplido* si acumula tantas vencidas como diga su tolerancia, *vigente* si no. Solo la cancelación se guarda, porque es una decisión de alguien. Si se anula un cobro, el plan vuelve solo a vigente.
- **Cancelar un plan lo deja todo como antes:** sus cuotas pendientes se anulan y la deuda original vuelve a pendiente. No se puede cancelar un plan que ya tiene cuotas cobradas: primero hay que anular esos cobros.
- **Una cuota se puede refinanciar más de una vez** si el plan anterior se canceló, sin perder el registro de aquel plan. Que no esté en dos planes vivos a la vez lo garantiza su estado `REFINANCIADA`, no un índice.
- La numeración de planes es correlativa y sin huecos, con el mismo contador transaccional que los recibos.

### Avisos de vencimiento

- **Un correo por socio, no uno por cuota.** El proceso junta todas las cuotas del socio que vencen ese día y manda un solo mensaje, aunque tenga varias parcelas.
- **Se avisa en dos momentos:** X días antes del vencimiento y exactamente Y días después. Los dos son configurables, y `Y = 0` apaga el aviso de cuota vencida. Se avisa una sola vez por cada momento, no todos los días.
- **Un aviso por socio, tipo y día**, garantizado por un índice único. Correr el proceso dos veces el mismo día no manda el correo dos veces.
- **El SMTP se configura en el entorno, no en la pantalla:** las contraseñas de la casilla son cosa del despliegue. `SMTP_HOST=json` arma los correos y los deja en el log sin enviarlos, para desarrollo. Sin `SMTP_HOST` los avisos no se pueden activar.
- **Los envíos fallidos se reintentan** en las corridas siguientes con las mismas cuotas, hasta 5 intentos. Si para entonces el socio ya pagó, deja de reintentarse y queda anotado por qué.
- **Los socios sin email quedan registrados** como `SIN_EMAIL`: filtrando por ese resultado en el historial sale el listado de a quién hay que llamar, con su teléfono.
- **El cron corre cada hora** y adentro comprueba si es la hora configurada y si hoy ya corrió. La hora se elige desde la pantalla, así que no puede vivir en la expresión cron. `AVISOS_CRON=off` lo desactiva.
- **Las plantillas por defecto las crea la API, no la migración.** El motor de migraciones lee el `.sql` con una codificación que no siempre es UTF-8 y los acentos quedaban rotos en la base; los textos viven en `@mf/shared` y la fila de configuración se crea en el primer acceso.

### Panel y reportes

- **Los totales del panel y los de los reportes salen de las mismas consultas.** `ConsultasService` es el único lugar donde se calculan, y tanto la pantalla como los archivos lo usan: no pueden decir cosas distintas.
- **Un cobro anulado no es plata que entró.** Aparece en el listado exportado, marcado como anulado, pero la fila de totales lo deja afuera y lo aclara: «Total (4 de 5)». Ese número es el mismo que muestra el panel.
- **La deuda es de hoy, no del rango.** El rango filtra cobros y planes, que son hechos con fecha; una cuota impaga no tiene fecha de corte. Por eso el padrón y los morosos se exportan siempre como una foto del momento.
- **«Emitido» del gráfico deja afuera las anuladas y las refinanciadas:** estas últimas ya se cuentan en las cuotas del plan que las reemplazó, y contarlas dos veces inflaría la mora.
- **Morosidad** es socios activos con al menos una cuota vencida sobre el total de socios activos.
- **El CSV usa punto y coma y lleva BOM**, que es lo que abre bien el Excel en español sin pasar por el asistente de importación. Los importes van con coma decimal, igual que en pantalla.
- El Excel trae encabezado del club, filtros en la cabecera, la fila de titulares congelada y formato de moneda en las columnas de dinero.
