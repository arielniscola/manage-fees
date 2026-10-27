import { Injectable } from '@nestjs/common';
import {
  conceptoCuota,
  estadoVisible,
  hoy,
  moraSugerida,
  numeroRecibo,
  type ConfiguracionInteres,
  type CuotaAnular,
  type CuotaListar,
  type CuotaListItem,
  type Paginado,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado } from '../common/errores';
import { aFecha, deFecha } from '../common/fechas';
import { cuotasDelLoteo } from '../common/loteo';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { PrismaService } from '../prisma/prisma.module';
import { GeneracionService } from './generacion.service';

const conSocioYParcela = {
  socio: { select: { id: true, numero: true, nombre: true, apellido: true } },
  parcela: parcelaResumen,
  plan: { select: { id: true, numero: true, cantidadCuotas: true } },
} satisfies Prisma.CuotaInclude;

type CuotaCompleta = Prisma.CuotaGetPayload<{ include: typeof conSocioYParcela }>;

/** Días transcurridos entre dos fechas 'AAAA-MM-DD'. */
const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

@Injectable()
export class CuotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interes: InteresService,
    private readonly generacion: GeneracionService,
  ) {}

  async listar({
    q,
    socioId,
    parcelaId,
    periodo,
    venceDesde,
    venceHasta,
    estado,
    origen,
    loteoId,
    page,
    pageSize,
    orden,
    dir,
  }: CuotaListar): Promise<Paginado<CuotaListItem>> {
    const hoyISO = hoy();
    const where: Prisma.CuotaWhereInput = {
      ...(socioId && { socioId }),
      ...(parcelaId && { parcelaId }),
      ...(periodo && { periodo }),
      ...(origen && { origen }),
      ...this.filtroEstado(estado, hoyISO),
      ...(q && { OR: this.condicionesBusqueda(q) }),
      // El rango va en el AND, junto al loteo: el filtro de estado también puede acotar el vencimiento.
      AND: [
        cuotasDelLoteo(loteoId),
        {
          vencimiento: {
            ...(venceDesde && { gte: aFecha(venceDesde) }),
            ...(venceHasta && { lte: aFecha(venceHasta) }),
          },
        },
      ],
    };

    const config = await this.interes.vigente();
    const [total, cuotas] = await this.prisma.$transaction([
      this.prisma.cuota.count({ where }),
      this.prisma.cuota.findMany({
        where,
        include: conSocioYParcela,
        orderBy: this.ordenDeCuotas(orden, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: cuotas.map((c) => this.aListItem(c, hoyISO, config)), total, page, pageSize };
  }

  /** El id cierra cada orden, para que las páginas no se pisen entre filas empatadas. */
  private ordenDeCuotas(orden: CuotaListar['orden'], dir: CuotaListar['dir'] = 'asc'): Prisma.CuotaOrderByWithRelationInput[] {
    switch (orden) {
      case 'periodo':
        return [{ periodo: dir }, { parcela: { codigo: 'asc' } }, { id: 'asc' }];
      case 'socio':
        return [{ socio: { apellido: dir } }, { socio: { nombre: dir } }, { periodo: 'desc' }, { id: 'asc' }];
      case 'parcela':
        return [{ parcela: { codigo: dir } }, { periodo: 'desc' }, { id: 'asc' }];
      case 'vencimiento':
        return [{ vencimiento: dir }, { id: dir }];
      case 'importe':
        return [{ importe: dir }, { periodo: 'desc' }, { id: 'asc' }];
      default:
        return [{ periodo: 'desc' }, { parcela: { codigo: 'asc' } }, { id: 'asc' }];
    }
  }

  /**
    * Cuotas de un socio sin paginar, de la más nueva a la más vieja. La usan la ficha y
    * las pantallas que necesitan toda la deuda junta, como registrar pago o armar un plan.
    */
  async deSocio(socioId: number, estado: CuotaListar['estado'] = 'todas'): Promise<CuotaListItem[]> {
    const hoyISO = hoy();
    const [config, cuotas] = await Promise.all([
      this.interes.vigente(),
      this.prisma.cuota.findMany({
        where: { socioId, ...this.filtroEstado(estado, hoyISO) },
        include: conSocioYParcela,
        orderBy: [{ periodo: 'desc' }, { parcela: { codigo: 'asc' } }],
      }),
    ]);
    return cuotas.map((c) => this.aListItem(c, hoyISO, config));
  }

  /**
   * Anula una cuota generada por error o que el club decide no cobrar. No se borra:
   * queda como constancia y, al ocupar el lugar del período, la generación no la recrea.
   */
  async anular(id: number, { motivo }: CuotaAnular): Promise<CuotaListItem> {
    const cuota = await this.prisma.cuota.findUnique({ where: { id } });
    if (!cuota) throw noEncontrado('No existe la cuota');
    if (cuota.estado === 'ANULADA') throw conflicto('La cuota ya está anulada');
    if (cuota.estado === 'PAGADA') throw conflicto('La cuota está pagada: para revertirla hay que anular el cobro');
    if (cuota.estado === 'REFINANCIADA') {
      throw conflicto('La cuota está refinanciada en un plan de pago: para revertirla hay que cancelar el plan');
    }

    const actualizada = await this.prisma.cuota.update({
      where: { id },
      data: { estado: 'ANULADA', anuladaEn: new Date(), motivoAnulacion: motivo },
      include: conSocioYParcela,
    });
    return this.aListItem(actualizada, hoy(), await this.interes.vigente());
  }

  /**
   * Borra una cuota anulada: es limpieza de lo que se generó o cargó por error. Solo las
   * anuladas, para que nunca desaparezca deuda sin rastro. Ojo: una cuota de parcela o
   * social anulada es la que impide que la generación vuelva a crear ese período; al
   * borrarla, la próxima corrida lo genera de nuevo si sigue correspondiendo.
   *
   * Si quedó en cobros que después se anularon, con `quitarDeCobros` se la saca de ellos.
   */
  async eliminar(id: number, { quitarDeCobros = false } = {}): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cuota = await tx.cuota.findUnique({
        where: { id },
        include: { _count: { select: { refinanciadaEn: true } } },
      });
      if (!cuota) throw noEncontrado('No existe la cuota');
      if (cuota.estado !== 'ANULADA') throw conflicto('Solo se pueden eliminar cuotas anuladas');
      if (cuota.origen === 'PLAN') throw conflicto('Es una cuota de un plan de pago: forma parte del plan');
      if (cuota._count.refinanciadaEn > 0) throw conflicto('Figura en un plan de pago');
      await this.quitarDeCobrosAnulados(tx, id, quitarDeCobros);
      await tx.cuota.delete({ where: { id } });
    });
  }

  /**
   * Vuelve a generar una cuota anulada de parcela o social: borra la anulada y crea en su
   * lugar la que corresponde hoy, a nombre del titular actual de la parcela —o del mismo
   * socio, si es la social— y con la tarifa o el importe vigente para ese período. Sirve
   * cuando se anuló por un importe equivocado o porque la parcela cambió de titular. Si la
   * anulada quedó en cobros anulados, se la quita de ellos, como al eliminarla.
   */
  async regenerar(id: number): Promise<CuotaListItem> {
    const nueva = await this.prisma.$transaction(async (tx) => {
      const cuota = await tx.cuota.findUnique({
        where: { id },
        include: { _count: { select: { refinanciadaEn: true } } },
      });
      if (!cuota) throw noEncontrado('No existe la cuota');
      if (cuota.estado !== 'ANULADA') throw conflicto('Solo se pueden volver a generar cuotas anuladas');
      if (cuota.origen !== 'PARCELA' && cuota.origen !== 'SOCIO') {
        throw conflicto('Solo se vuelven a generar las cuotas de parcela y las sociales');
      }
      if (cuota._count.refinanciadaEn > 0) throw conflicto('Figura en un plan de pago');

      let socioId = cuota.socioId;
      if (cuota.origen === 'PARCELA') {
        const titular = await tx.asignacion.findFirst({
          where: { parcelaId: cuota.parcelaId!, hasta: null },
          orderBy: { desde: 'desc' },
          select: { socioId: true },
        });
        if (!titular) throw conflicto('La parcela no tiene un titular activo');
        socioId = titular.socioId;
      }
      const destino = cuota.origen === 'PARCELA' ? { origen: 'PARCELA' as const, parcelaId: cuota.parcelaId! } : { origen: 'SOCIO' as const };
      const candidata = await this.generacion.candidataDe(socioId, cuota.periodo, destino, tx);
      if (!candidata) throw conflicto('Ese período ya no corresponde: no hay tarifa ni importe que lo cobre');

      await this.quitarDeCobrosAnulados(tx, id, true);
      await tx.cuota.delete({ where: { id } });
      return tx.cuota.create({ data: candidata, include: conSocioYParcela });
    });
    return this.aListItem(nueva, hoy(), await this.interes.vigente());
  }

  /**
   * Saca una cuota anulada de los cobros en que figura, que tienen que estar anulados: uno
   * vigente la está cobrando. El cobro que queda sin renglones se elimina con su recibo,
   * como al eliminarlo a mano; el que tiene otros los conserva, y su recibo sigue
   * reimprimiéndose igual porque guarda sus datos. Sin `quitar`, solo avisa dónde figura.
   */
  private async quitarDeCobrosAnulados(tx: Prisma.TransactionClient, cuotaId: number, quitar: boolean): Promise<void> {
    const detalles = await tx.cobroDetalle.findMany({
      where: { cuotaId },
      select: { cobro: { select: { id: true, anuladoEn: true, recibo: { select: { numero: true } } } } },
    });
    if (detalles.length === 0) return;
    const recibo = (c: (typeof detalles)[number]['cobro']) => numeroRecibo(c.recibo?.numero ?? c.id);

    const vigente = detalles.find((d) => !d.cobro.anuladoEn);
    if (vigente) throw conflicto(`Figura en el recibo N° ${recibo(vigente.cobro)}, que no está anulado: anulá primero ese cobro`);
    if (!quitar) {
      const recibos = detalles.map((d) => recibo(d.cobro)).join(', ');
      throw conflicto(`Figura en el cobro anulado del recibo N° ${recibos}: elegí quitarla también de ahí`);
    }

    const cobroIds = detalles.map((d) => d.cobro.id);
    await tx.cobroDetalle.deleteMany({ where: { cuotaId } });
    // Los renglones y el recibo se borran en cascada.
    await tx.cobro.deleteMany({ where: { id: { in: cobroIds }, detalles: { none: {} } } });
  }

  /**
   * Borra una cuota pagada del historial, para corregir una carga equivocada. Es solo para
   * superadmins: no deja rastro. Únicamente las históricas, que no tienen cobro ni recibo;
   * una pagada por el sistema se revierte anulando su cobro. Al borrarla el período queda
   * libre y se puede volver a cargar, o la generación lo crea si sigue correspondiendo.
   */
  async eliminarHistoricaPagada(id: number): Promise<void> {
    const cuota = await this.prisma.cuota.findUnique({
      where: { id },
      include: { _count: { select: { detallesCobro: true, refinanciadaEn: true } } },
    });
    if (!cuota) throw noEncontrado('No existe la cuota');
    if (!cuota.historica) throw conflicto('No viene del historial: para revertir el pago hay que anular el cobro');
    if (cuota.estado !== 'PAGADA') throw conflicto('No está pagada');
    if (cuota._count.detallesCobro > 0) throw conflicto('Figura en un cobro: eliminá primero ese cobro');
    if (cuota._count.refinanciadaEn > 0) throw conflicto('Figura en un plan de pago');
    await this.prisma.cuota.delete({ where: { id } });
  }

  private filtroEstado(estado: CuotaListar['estado'], hoyISO: string): Prisma.CuotaWhereInput {
    const vence = aFecha(hoyISO);
    switch (estado) {
      case 'pendiente':
        return { estado: 'PENDIENTE', vencimiento: { gte: vence } };
      case 'vencida':
        return { estado: 'PENDIENTE', vencimiento: { lt: vence } };
      case 'impaga':
        return { estado: 'PENDIENTE' };
      case 'pagada':
        return { estado: 'PAGADA' };
      case 'anulada':
        return { estado: 'ANULADA' };
      case 'refinanciada':
        return { estado: 'REFINANCIADA' };
      default:
        return {};
    }
  }

  private condicionesBusqueda(q: string): Prisma.CuotaWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.CuotaWhereInput[] = [
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
      { parcela: { codigo: { contains: q, mode: 'insensitive' } } },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      condiciones.push({ socio: { dni: { contains: digitos } } });
      const numero = Number(digitos);
      if (Number.isSafeInteger(numero) && numero <= 2_147_483_647) condiciones.push({ socio: { numero } });
    }
    return condiciones;
  }

  private aListItem(c: CuotaCompleta, hoyISO: string, config: ConfiguracionInteres | null): CuotaListItem {
    const vencimiento = deFecha(c.vencimiento);
    const estado = estadoVisible(c.estado, vencimiento, hoyISO);
    const plan =
      c.plan && c.numeroEnPlan !== null
        ? {
            id: c.plan.id,
            numero: c.plan.numero,
            cuotaNumero: c.numeroEnPlan,
            cantidadCuotas: c.plan.cantidadCuotas,
          }
        : null;

    return {
      id: c.id,
      periodo: c.periodo,
      periodicidad: c.periodicidad,
      etiqueta: conceptoCuota({ origen: c.origen, periodo: c.periodo, periodicidad: c.periodicidad, plan }),
      importe: c.importe,
      vencimiento,
      estado,
      origen: c.origen,
      adelantada: c.adelantada,
      historica: c.historica,
      diasVencida: estado === 'vencida' ? diasEntre(vencimiento, hoyISO) : 0,
      mora: moraSugerida({ ...c, vencimiento }, config, hoyISO),
      socio: c.socio,
      parcela: c.parcela && { ...aParcelaUbicada(c.parcela), sector: c.parcela.sector },
      plan,
      motivoAnulacion: c.motivoAnulacion,
    };
  }
}
