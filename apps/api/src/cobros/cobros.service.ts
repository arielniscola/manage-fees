import { Injectable } from '@nestjs/common';
import {
  conceptoCuota,
  hoy,
  interesDeCuota,
  type CobroAnular,
  type CobroCrear,
  type CobroDetalle,
  type CobroListar,
  type CobroListItem,
  type CobrosPaginados,
  type DatosRecibo,
  type UsuarioSesion,
} from '@mf/shared';
import { Prisma, type OrigenCuota, type Periodicidad } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha } from '../common/fechas';
import { cobrosDelLoteo } from '../common/loteo';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { AdelantosService } from '../cuotas/adelantos.service';
import { PrismaService } from '../prisma/prisma.module';

const NOMBRE_CLUB = process.env.CLUB_NOMBRE || 'Cooperativa';

/** Tope de renglones de un recibo, ya sean cuotas tildadas o adelantadas. */
const MAX_CUOTAS_POR_COBRO = 120;

const completo = {
  socio: { select: { id: true, numero: true, nombre: true, apellido: true } },
  usuario: { select: { nombre: true } },
  anuladoPor: { select: { nombre: true } },
  recibo: { select: { numero: true } },
  detalles: {
    orderBy: { cuota: { periodo: 'asc' } },
    include: {
      cuota: {
        include: {
          parcela: parcelaResumen,
          plan: { select: { id: true, numero: true, cantidadCuotas: true } },
        },
      },
    },
  },
  _count: { select: { detalles: true } },
} satisfies Prisma.CobroInclude;

type CobroCompleto = Prisma.CobroGetPayload<{ include: typeof completo }>;

@Injectable()
export class CobrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interes: InteresService,
    private readonly adelantos: AdelantosService,
  ) {}

  async listar({ q, socioId, parcelaId, desde, hasta, medio, estado, loteoId, page, pageSize }: CobroListar): Promise<CobrosPaginados> {
    const where: Prisma.CobroWhereInput = {
      ...(socioId && { socioId }),
      // Un cobro es «de la parcela» si alguno de sus renglones cancela una cuota suya.
      ...(parcelaId && { detalles: { some: { cuota: { parcelaId } } } }),
      ...(medio && { medio }),
      ...(estado === 'vigentes' && { anuladoEn: null }),
      ...(estado === 'anulados' && { anuladoEn: { not: null } }),
      ...((desde || hasta) && {
        fecha: { ...(desde && { gte: aFecha(desde) }), ...(hasta && { lte: aFecha(hasta) }) },
      }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
      ...cobrosDelLoteo(loteoId),
    };

    const [total, cobros, suma] = await this.prisma.$transaction([
      this.prisma.cobro.count({ where }),
      this.prisma.cobro.findMany({
        where,
        include: completo,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // El resumen suma todo lo filtrado, no solo la página, y deja afuera los anulados.
      this.prisma.cobro.aggregate({ where: { ...where, anuladoEn: null }, _sum: { total: true }, _count: true }),
    ]);

    return {
      items: cobros.map((c) => this.aListItem(c)),
      total,
      page,
      pageSize,
      resumen: { cobros: suma._count, total: suma._sum.total ?? 0 },
    };
  }

  async obtener(id: number): Promise<CobroDetalle> {
    const cobro = await this.prisma.cobro.findUnique({ where: { id }, include: completo });
    if (!cobro) throw noEncontrado('No existe el cobro');
    return this.aDetalle(cobro);
  }

  /** Historial de pagos de un socio, del más nuevo al más viejo. Para la ficha. */
  async deSocio(socioId: number): Promise<CobroListItem[]> {
    const cobros = await this.prisma.cobro.findMany({
      where: { socioId },
      include: completo,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
    return cobros.map((c) => this.aListItem(c));
  }

  /**
   * Registra el pago de una o varias cuotas y emite el recibo, todo en una sola transacción:
   * nunca queda un recibo sin cuotas, ni una cuota pagada sin recibo, ni un número salteado.
   *
   * Si el cobro adelanta cuotas, las futuras se crean acá adentro y se cobran en el mismo
   * recibo: o quedan creadas y pagas, o no queda ninguna.
   */
  async registrar(usuario: UsuarioSesion, datos: CobroCrear): Promise<CobroDetalle> {
    const elegidas = [...new Set(datos.cuotaIds)];
    // El interés se calcula al vuelo, así que se congela acá: lo que se cobra hoy es lo
    // que queda escrito en el detalle y en el recibo, aunque mañana el recargo sea otro.
    const hoyISO = hoy();
    const config = await this.interes.vigente();

    const id = await this.prisma.$transaction(async (tx) => {
      const socio = await tx.socio.findUnique({ where: { id: datos.socioId } });
      if (!socio) throw noEncontrado('No existe el socio');

      // Las adelantadas nacen acá: si algo falla más abajo, la transacción las borra.
      const adelanto = datos.adelantarHasta
        ? await this.adelantos.preparar(tx, datos.socioId, datos.adelantarHasta, datos.adelantarExcepto)
        : null;
      const cuotaIds = [...elegidas, ...(adelanto?.ids ?? [])];
      // Puede quedar vacío si el cobro era solo un adelanto y se sacaron todos los renglones.
      if (cuotaIds.length === 0) throw reglaIncumplida('Elegí al menos una cuota', 'cuotaIds');
      if (cuotaIds.length > MAX_CUOTAS_POR_COBRO) {
        throw reglaIncumplida(`Son demasiadas cuotas para un solo recibo (${cuotaIds.length})`, 'cuotaIds');
      }

      const cuotas = await tx.cuota.findMany({
        where: { id: { in: cuotaIds } },
        include: {
          parcela: parcelaResumen,
          plan: { select: { id: true, numero: true, cantidadCuotas: true } },
        },
        orderBy: [{ periodo: 'asc' }, { numeroEnPlan: 'asc' }, { parcelaId: 'asc' }],
      });
      if (cuotas.length !== cuotaIds.length) throw noEncontrado('Alguna de las cuotas elegidas ya no existe');

      const ajena = cuotas.find((c) => c.socioId !== datos.socioId);
      if (ajena) throw reglaIncumplida(`La cuota ${concepto(ajena)} no es de este socio`, 'cuotaIds');

      const impagable = cuotas.find((c) => c.estado !== 'PENDIENTE');
      if (impagable) {
        const como = {
          PAGADA: 'ya está pagada',
          ANULADA: 'está anulada',
          REFINANCIADA: 'está refinanciada en un plan de pago',
          PENDIENTE: '',
        }[impagable.estado];
        throw conflicto(`La cuota ${concepto(impagable)} ${como}`, 'cuotaIds');
      }

      // Solo marca las que siguen pendientes: si otra pantalla las cobró recién, el
      // conteo no coincide y la transacción entera vuelve atrás.
      const { count } = await tx.cuota.updateMany({
        where: { id: { in: cuotaIds }, estado: 'PENDIENTE' },
        data: { estado: 'PAGADA' },
      });
      if (count !== cuotaIds.length) {
        throw conflicto('Alguna de las cuotas se cobró desde otra pantalla. Revisá el detalle y volvé a intentarlo.');
      }

      const recargo = new Map(cuotas.map((c) => [c.id, interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO)]));
      // El descuento por pago adelantado ya viene calculado sobre el importe de cada
      // cuota creada; al recibo va restado, igual que el interés va sumado.
      const descuento = adelanto?.descuentos ?? new Map<number, number>();
      const cobrado = (c: { id: number; importe: number }) =>
        c.importe + (recargo.get(c.id) ?? 0) - (descuento.get(c.id) ?? 0);
      const total = cuotas.reduce((t, c) => t + cobrado(c), 0);
      const cobro = await tx.cobro.create({
        data: {
          socioId: datos.socioId,
          fecha: aFecha(datos.fecha),
          medio: datos.medio,
          total,
          observaciones: datos.observaciones,
          usuarioId: usuario.id,
          detalles: { create: cuotas.map((c) => ({ cuotaId: c.id, importe: cobrado(c) })) },
        },
      });

      const numero = await this.siguienteNumeroDeRecibo(tx);
      const emitidoEn = new Date();
      const snapshot: DatosRecibo = {
        numero,
        emitidoEn: emitidoEn.toISOString(),
        fecha: datos.fecha,
        club: NOMBRE_CLUB,
        socio: {
          numero: socio.numero,
          nombre: socio.nombre,
          apellido: socio.apellido,
          dni: socio.dni,
          direccion: socio.direccion,
        },
        medio: datos.medio,
        observaciones: datos.observaciones,
        detalles: cuotas.map((c) => ({
          // La social ya se nombra sola; la de parcela se aclara, porque su concepto es el período.
          concepto: `${c.origen === 'PARCELA' ? `Cuota de parcela ${concepto(c)}` : concepto(c)}${c.adelantada ? ' (adelantada)' : ''}`,
          parcela: c.parcela ? aParcelaUbicada(c.parcela).etiqueta : '—',
          vencimiento: deFecha(c.vencimiento),
          importe: cobrado(c),
          interes: recargo.get(c.id) || undefined,
          descuento: descuento.get(c.id) || undefined,
        })),
        total,
        registradoPor: usuario.nombre,
      };

      await tx.recibo.create({
        data: { numero, cobroId: cobro.id, emitidoEn, datos: snapshot as unknown as Prisma.InputJsonValue },
      });
      return cobro.id;
    });

    return this.obtener(id);
  }

  /**
   * Anula un cobro mal cargado: el recibo queda marcado como anulado y sus cuotas
   * vuelven a pendiente. No se borra nada, para que el número de recibo siga existiendo.
   *
   * Las adelantadas también vuelven a pendiente, aunque las haya creado este cobro: son
   * períodos que el socio va a deber igual, solo que se generaron antes de tiempo. No se
   * borran ni se anulan porque el período quedaría sin cuota para siempre —el índice
   * único no deja generarla de nuevo— y el club la perdería.
   */
  async anular(id: number, usuario: UsuarioSesion, { motivo }: CobroAnular): Promise<CobroDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const cobro = await tx.cobro.findUnique({ where: { id }, include: { detalles: true } });
      if (!cobro) throw noEncontrado('No existe el cobro');
      if (cobro.anuladoEn) throw conflicto('El cobro ya está anulado');

      // Solo vuelven a pendiente las que siguen pagadas: una anulada a mano queda como está.
      await tx.cuota.updateMany({
        where: { id: { in: cobro.detalles.map((d) => d.cuotaId) }, estado: 'PAGADA' },
        data: { estado: 'PENDIENTE' },
      });
      await tx.cobro.update({
        where: { id },
        data: { anuladoEn: new Date(), anuladoPorId: usuario.id, motivoAnulacion: motivo },
      });
      await tx.recibo.update({ where: { cobroId: id }, data: { anulado: true } });
    });

    return this.obtener(id);
  }

  /**
   * Toma el siguiente número dentro de la transacción. El UPDATE bloquea la fila del
   * contador, así dos cobros simultáneos no pueden llevarse el mismo número, y si algo
   * falla después el incremento vuelve atrás con el resto.
   */
  private async siguienteNumeroDeRecibo(tx: Prisma.TransactionClient): Promise<number> {
    const filas = await tx.$queryRaw<{ valor: number }[]>`
      UPDATE "Contador" SET valor = valor + 1 WHERE nombre = 'recibo' RETURNING valor
    `;
    const valor = filas[0]?.valor;
    if (valor === undefined) throw new Error('Falta el contador de recibos en la base');
    return valor;
  }

  private condicionesBusqueda(q: string): Prisma.CobroWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.CobroWhereInput[] = [
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
      { detalles: { some: { cuota: { parcela: { codigo: { contains: q, mode: 'insensitive' } } } } } },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      const numero = Number(digitos);
      condiciones.push({ socio: { dni: { contains: digitos } } });
      if (Number.isSafeInteger(numero) && numero <= 2_147_483_647) {
        condiciones.push({ socio: { numero } });
        // Buscar por número de recibo, con o sin los ceros de adelante.
        condiciones.push({ recibo: { numero } });
      }
    }
    return condiciones;
  }

  private aListItem(c: CobroCompleto): CobroListItem {
    return {
      id: c.id,
      fecha: deFecha(c.fecha),
      medio: c.medio,
      total: c.total,
      observaciones: c.observaciones,
      socio: c.socio,
      numeroRecibo: c.recibo?.numero ?? 0,
      cantidadCuotas: c._count.detalles,
      anulado: c.anuladoEn !== null,
      anuladoEn: c.anuladoEn?.toISOString() ?? null,
      motivoAnulacion: c.motivoAnulacion,
      registradoPor: c.usuario.nombre,
    };
  }

  private aDetalle(c: CobroCompleto): CobroDetalle {
    return {
      ...this.aListItem(c),
      anuladoPor: c.anuladoPor?.nombre ?? null,
      cuotas: c.detalles.map((d) => ({
        cuotaId: d.cuotaId,
        periodo: d.cuota.periodo,
        periodicidad: d.cuota.periodicidad,
        etiqueta: concepto(d.cuota),
        parcela: d.cuota.parcela && aParcelaUbicada(d.cuota.parcela),
        vencimiento: deFecha(d.cuota.vencimiento),
        importe: d.importe,
        adelantada: d.cuota.adelantada,
      })),
    };
  }
}

/** Concepto legible de una cuota, sea social o de un plan de pago. */
function concepto(c: {
  origen: OrigenCuota;
  periodo: string;
  periodicidad: Periodicidad;
  numeroEnPlan: number | null;
  plan: { id: number; numero: number; cantidadCuotas: number } | null;
}): string {
  return conceptoCuota({
    origen: c.origen,
    periodo: c.periodo,
    periodicidad: c.periodicidad,
    plan:
      c.plan && c.numeroEnPlan !== null
        ? { id: c.plan.id, numero: c.plan.numero, cuotaNumero: c.numeroEnPlan, cantidadCuotas: c.plan.cantidadCuotas }
        : null,
  });
}
