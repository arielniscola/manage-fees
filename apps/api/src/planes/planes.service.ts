import { Injectable } from '@nestjs/common';
import {
  ANTICIPO,
  conceptoCuota,
  estadoVisible,
  hoy,
  interesDeCuota,
  mesDe,
  simularPlan,
  type EstadoPlan,
  type Paginado,
  type PlanCancelar,
  type PlanCrear,
  type PlanDetalle,
  type PlanListar,
  type PlanListItem,
  type UsuarioSesion,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha } from '../common/fechas';
import { planesDelLoteo } from '../common/loteo';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { PrismaService } from '../prisma/prisma.module';

const completo = {
  socio: { select: { id: true, numero: true, nombre: true, apellido: true } },
  usuario: { select: { nombre: true } },
  cuotas: { orderBy: { numeroEnPlan: 'asc' } },
  origenes: {
    orderBy: { cuota: { periodo: 'asc' } },
    include: { cuota: { include: { parcela: parcelaResumen } } },
  },
} satisfies Prisma.PlanPagoInclude;

type PlanCompleto = Prisma.PlanPagoGetPayload<{ include: typeof completo }>;

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

@Injectable()
export class PlanesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interes: InteresService,
  ) {}

  async listar({ q, socioId, estado, loteoId, page, pageSize }: PlanListar): Promise<Paginado<PlanListItem>> {
    const where: Prisma.PlanPagoWhereInput = {
      ...(socioId && { socioId }),
      // Cancelado sí se guarda; el resto de los estados se calculan y se filtran después.
      ...(estado === 'cancelado' && { canceladoEn: { not: null } }),
      ...(estado !== 'cancelado' && estado !== 'todos' && { canceladoEn: null }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
      ...planesDelLoteo(loteoId),
    };

    const planes = await this.prisma.planPago.findMany({
      where,
      include: completo,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });

    const hoyISO = hoy();
    const items = planes
      .map((p) => this.aListItem(p, hoyISO))
      .filter((p) => estado === 'todos' || p.estado === estado);

    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  async obtener(id: number): Promise<PlanDetalle> {
    const plan = await this.prisma.planPago.findUnique({ where: { id }, include: completo });
    if (!plan) throw noEncontrado('No existe el plan de pago');
    return this.aDetalle(plan, hoy());
  }

  async deSocio(socioId: number): Promise<PlanListItem[]> {
    const planes = await this.prisma.planPago.findMany({
      where: { socioId },
      include: completo,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
    const hoyISO = hoy();
    return planes.map((p) => this.aListItem(p, hoyISO));
  }

  /**
   * Refinancia cuotas impagas: las elegidas quedan REFINANCIADAS y el plan genera cuotas
   * nuevas con origen PLAN por el mismo total. Todo en una transacción, para que nunca
   * queden cuotas refinanciadas sin plan que las reemplace.
   */
  async crear(usuario: UsuarioSesion, datos: PlanCrear): Promise<PlanDetalle> {
    const id = await this.prisma.$transaction((tx) => this.crearEn(tx, usuario, datos));
    return this.obtener(id);
  }

  /**
   * El plan dentro de una transacción que puede ser de otro: transferir una parcela con
   * deuda firma el plan y cambia el titular en el mismo movimiento. Devuelve el id.
   */
  async crearEn(tx: Prisma.TransactionClient, usuario: UsuarioSesion, datos: PlanCrear): Promise<number> {
    const cuotaIds = [...new Set(datos.cuotaIds)];
    // Refinanciar congela la deuda del día: cada cuota entra con el interés por mora que
    // tenía al firmarse. Las cuotas del plan que nace ya no vuelven a devengar interés.
    const hoyISO = hoy();
    const config = await this.interes.vigente();

    {
      const socio = await tx.socio.findUnique({ where: { id: datos.socioId } });
      if (!socio) throw noEncontrado('No existe el socio');

      const cuotas = await tx.cuota.findMany({
        where: { id: { in: cuotaIds } },
        include: { parcela: parcelaResumen },
      });
      if (cuotas.length !== cuotaIds.length) throw noEncontrado('Alguna de las cuotas elegidas ya no existe');

      const ajena = cuotas.find((c) => c.socioId !== datos.socioId);
      if (ajena) throw reglaIncumplida('Alguna de las cuotas no es de este socio', 'cuotaIds');

      // Se refinancia deuda de las cuotas del período —sociales y de parcela—. Refinanciar
      // una cuota de otro plan dejaría ese plan a medio camino y la deuda contada dos veces.
      const dePlan = cuotas.find((c) => c.origen === 'PLAN');
      if (dePlan) {
        throw reglaIncumplida('Las cuotas de un plan de pago no se pueden volver a refinanciar', 'cuotaIds');
      }
      const impagable = cuotas.find((c) => c.estado !== 'PENDIENTE');
      if (impagable) {
        const como = { PAGADA: 'ya está pagada', ANULADA: 'está anulada', REFINANCIADA: 'ya está refinanciada', PENDIENTE: '' }[
          impagable.estado
        ];
        const cual = impagable.parcela ? aParcelaUbicada(impagable.parcela).etiqueta : '—';
        throw conflicto(`La cuota de la parcela ${cual} ${como}`, 'cuotaIds');
      }

      const recargo = new Map(cuotas.map((c) => [c.id, interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO)]));
      const refinanciado = (c: { id: number; importe: number }) => c.importe + (recargo.get(c.id) ?? 0);
      const deudaTotal = cuotas.reduce((t, c) => t + refinanciado(c), 0);
      if (datos.anticipo > deudaTotal) {
        throw reglaIncumplida('El anticipo no puede ser mayor que la deuda que se refinancia', 'anticipo');
      }
      if (datos.anticipo === deudaTotal) {
        throw reglaIncumplida('Si el anticipo cubre toda la deuda, registrá un cobro común en vez de un plan', 'anticipo');
      }

      // Solo marca las que siguen pendientes: si otra pantalla las cobró o refinanció
      // recién, el conteo no coincide y la transacción entera vuelve atrás.
      const { count } = await tx.cuota.updateMany({
        where: { id: { in: cuotaIds }, estado: 'PENDIENTE' },
        data: { estado: 'REFINANCIADA' },
      });
      if (count !== cuotaIds.length) {
        throw conflicto('Alguna de las cuotas cambió desde otra pantalla. Revisá el detalle y volvé a intentarlo.');
      }

      const simulacion = simularPlan({
        deudaTotal,
        anticipo: datos.anticipo,
        cantidadCuotas: datos.cantidadCuotas,
        fecha: datos.fecha,
        primerVencimiento: datos.primerVencimiento,
      });

      const numero = await this.siguienteNumero(tx);
      const plan = await tx.planPago.create({
        data: {
          numero,
          socioId: datos.socioId,
          fecha: aFecha(datos.fecha),
          deudaTotal,
          anticipo: datos.anticipo,
          cantidadCuotas: datos.cantidadCuotas,
          toleranciaVencidas: datos.toleranciaVencidas,
          observaciones: datos.observaciones,
          usuarioId: usuario.id,
          origenes: { create: cuotas.map((c) => ({ cuotaId: c.id, importe: refinanciado(c) })) },
        },
      });

      await tx.cuota.createMany({
        data: simulacion.cuotas.map((c) => ({
          socioId: datos.socioId,
          planId: plan.id,
          numeroEnPlan: c.numero,
          periodo: mesDe(c.vencimiento),
          periodicidad: 'MENSUAL' as const,
          importe: c.importe,
          vencimiento: aFecha(c.vencimiento),
          origen: 'PLAN' as const,
        })),
      });

      return plan.id;
    }
  }

  /**
   * Cancela el plan: sus cuotas pendientes se anulan y la deuda original vuelve a
   * pendiente, como si el plan nunca se hubiera firmado.
   */
  async cancelar(id: number, usuario: UsuarioSesion, { motivo }: PlanCancelar): Promise<PlanDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const plan = await tx.planPago.findUnique({ where: { id }, include: { cuotas: true, origenes: true } });
      if (!plan) throw noEncontrado('No existe el plan de pago');
      if (plan.canceladoEn) throw conflicto('El plan ya está cancelado');

      const pagadas = plan.cuotas.filter((c) => c.estado === 'PAGADA');
      if (pagadas.length > 0) {
        throw conflicto(
          `El plan ya tiene ${pagadas.length === 1 ? 'una cuota cobrada' : `${pagadas.length} cuotas cobradas`}. ` +
            'Anulá primero esos cobros y después cancelá el plan.',
        );
      }

      await tx.cuota.updateMany({
        where: { planId: id, estado: 'PENDIENTE' },
        data: { estado: 'ANULADA', anuladaEn: new Date(), motivoAnulacion: `Plan cancelado: ${motivo}` },
      });
      await tx.cuota.updateMany({
        where: { id: { in: plan.origenes.map((o) => o.cuotaId) }, estado: 'REFINANCIADA' },
        data: { estado: 'PENDIENTE' },
      });
      await tx.planPago.update({
        where: { id },
        data: { canceladoEn: new Date(), canceladoPorId: usuario.id, motivoCancelacion: motivo },
      });
    });

    return this.obtener(id);
  }

  /** Mismo mecanismo que los recibos: correlativo y sin huecos aunque algo falle. */
  private async siguienteNumero(tx: Prisma.TransactionClient): Promise<number> {
    const filas = await tx.$queryRaw<{ valor: number }[]>`
      UPDATE "Contador" SET valor = valor + 1 WHERE nombre = 'plan' RETURNING valor
    `;
    const valor = filas[0]?.valor;
    if (valor === undefined) throw new Error('Falta el contador de planes en la base');
    return valor;
  }

  private condicionesBusqueda(q: string): Prisma.PlanPagoWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.PlanPagoWhereInput[] = [
      {
        socio: {
          AND: palabras.map((p) => ({
            OR: [
              { nombre: { contains: p, mode: 'insensitive' as const } },
              { apellido: { contains: p, mode: 'insensitive' as const } },
            ],
          })),
        },
      },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      const n = Number(digitos);
      condiciones.push({ socio: { dni: { contains: digitos } } });
      if (Number.isSafeInteger(n) && n <= 2_147_483_647) {
        condiciones.push({ socio: { numero: n } });
        condiciones.push({ numero: n });
      }
    }
    return condiciones;
  }

  /**
   * El estado sale de las cuotas, igual que «vencida»: no hace falta ningún proceso que
   * lo actualice, y si se anula un cobro el plan vuelve solo a vigente.
   */
  private aListItem(p: PlanCompleto, hoyISO: string): PlanListItem {
    const vivas = p.cuotas.filter((c) => c.estado !== 'ANULADA');
    const pagadas = vivas.filter((c) => c.estado === 'PAGADA');
    const impagas = vivas.filter((c) => c.estado === 'PENDIENTE');
    const vencidas = impagas.filter((c) => deFecha(c.vencimiento) < hoyISO);
    const cobrado = pagadas.reduce((t, c) => t + c.importe, 0);

    let estado: EstadoPlan = 'vigente';
    if (p.canceladoEn) estado = 'cancelado';
    else if (impagas.length === 0 && vivas.length > 0) estado = 'cumplido';
    else if (vencidas.length >= p.toleranciaVencidas) estado = 'incumplido';

    const proximo = impagas
      .map((c) => deFecha(c.vencimiento))
      .sort()
      .at(0);

    return {
      id: p.id,
      numero: p.numero,
      fecha: deFecha(p.fecha),
      socio: p.socio,
      deudaTotal: p.deudaTotal,
      anticipo: p.anticipo,
      financiado: p.deudaTotal - p.anticipo,
      cantidadCuotas: p.cantidadCuotas,
      toleranciaVencidas: p.toleranciaVencidas,
      estado,
      pagadas: pagadas.length,
      vencidas: vencidas.length,
      pendientes: impagas.length,
      cobrado,
      saldo: impagas.reduce((t, c) => t + c.importe, 0),
      proximoVencimiento: proximo ?? null,
      canceladoEn: p.canceladoEn?.toISOString() ?? null,
      motivoCancelacion: p.motivoCancelacion,
      creadoPor: p.usuario.nombre,
    };
  }

  private aDetalle(p: PlanCompleto, hoyISO: string): PlanDetalle {
    return {
      ...this.aListItem(p, hoyISO),
      observaciones: p.observaciones,
      cuotas: p.cuotas.map((c) => {
        const vencimiento = deFecha(c.vencimiento);
        const estado = estadoVisible(c.estado, vencimiento, hoyISO);
        return {
          cuotaId: c.id,
          numero: c.numeroEnPlan ?? ANTICIPO,
          vencimiento,
          importe: c.importe,
          estado,
          diasVencida: estado === 'vencida' ? diasEntre(vencimiento, hoyISO) : 0,
        };
      }),
      refinanciadas: p.origenes.map((o) => ({
        cuotaId: o.cuotaId,
        etiqueta: conceptoCuota({
          origen: o.cuota.origen,
          periodo: o.cuota.periodo,
          periodicidad: o.cuota.periodicidad,
          plan: null,
        }),
        parcela: o.cuota.parcela ? aParcelaUbicada(o.cuota.parcela).etiqueta : null,
        vencimiento: deFecha(o.cuota.vencimiento),
        importe: o.importe,
      })),
    };
  }
}
