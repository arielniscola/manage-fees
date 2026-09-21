import { Injectable } from '@nestjs/common';
import {
  conceptoCuota,
  estadoVisible,
  hoy,
  interesDeCuota,
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
  ) {}

  async listar({ q, socioId, parcelaId, periodo, estado, origen, loteoId, page, pageSize }: CuotaListar): Promise<Paginado<CuotaListItem>> {
    const hoyISO = hoy();
    const where: Prisma.CuotaWhereInput = {
      ...(socioId && { socioId }),
      ...(parcelaId && { parcelaId }),
      ...(periodo && { periodo }),
      ...(origen && { origen }),
      ...this.filtroEstado(estado, hoyISO),
      ...(q && { OR: this.condicionesBusqueda(q) }),
      ...cuotasDelLoteo(loteoId),
    };

    const config = await this.interes.vigente();
    const [total, cuotas] = await this.prisma.$transaction([
      this.prisma.cuota.count({ where }),
      this.prisma.cuota.findMany({
        where,
        include: conSocioYParcela,
        orderBy: [{ periodo: 'desc' }, { parcela: { codigo: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: cuotas.map((c) => this.aListItem(c, hoyISO, config)), total, page, pageSize };
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
      interes: interesDeCuota({ ...c, vencimiento }, config, hoyISO),
      socio: c.socio,
      parcela: c.parcela && { ...aParcelaUbicada(c.parcela), sector: c.parcela.sector },
      plan,
      motivoAnulacion: c.motivoAnulacion,
    };
  }
}
