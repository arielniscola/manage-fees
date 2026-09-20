import { Injectable } from '@nestjs/common';
import { hoy, interesDeCuota, pesos, primerPeriodoDelNuevoTitular } from '@mf/shared';
import type {
  DeudaDeTransferencia,
  Paginado,
  Transferencia,
  TransferenciaCrear,
  TransferenciaListar,
  TransferenciaRealizada,
  UsuarioSesion,
} from '@mf/shared';
import { Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha, fechaLegible } from '../common/fechas';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { InteresService } from '../configuracion/interes.service';
import { CuotasService } from '../cuotas/cuotas.service';
import { PlanesService } from '../planes/planes.service';
import { PrismaService } from '../prisma/prisma.module';

const socioResumen = { select: { id: true, numero: true, nombre: true, apellido: true } } as const;

const completa = {
  parcela: parcelaResumen,
  deSocio: socioResumen,
  aSocio: socioResumen,
  usuario: { select: { nombre: true } },
} satisfies Prisma.TransferenciaInclude;

type TransferenciaCompleta = Prisma.TransferenciaGetPayload<{ include: typeof completa }>;

/**
 * Transferencias de posesión de una parcela. El historial de asignaciones ya dice quién
 * la tuvo y hasta cuándo; esto además vincula las dos puntas y guarda el motivo y quién
 * la registró, que es lo que hace auditable un cambio de titular.
 */
@Injectable()
export class TransferenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cuotas: CuotasService,
    private readonly planes: PlanesService,
    private readonly interes: InteresService,
  ) {}

  /**
   * Lo que la parcela debe al día de la transferencia: las cuotas impagas de períodos que
   * ya habían empezado, que quedan con el titular saliente. Las de períodos futuros viajan
   * con la parcela, así que no son deuda de nadie todavía.
   */
  async deuda(parcelaId: number, fecha: string): Promise<DeudaDeTransferencia> {
    const vigente = await this.prisma.asignacion.findFirst({
      where: { parcelaId, hasta: null },
      include: { socio: { select: { id: true, numero: true, nombre: true, apellido: true } } },
    });
    if (!vigente) throw conflicto('La parcela no tiene titular: asignala en lugar de transferirla');

    const corte = primerPeriodoDelNuevoTitular(fecha);
    const { items } = await this.cuotas.listar({ parcelaId, estado: 'impaga', page: 1, pageSize: 500 });
    const cuotas = items.filter((c) => c.periodo < corte);

    return {
      socio: vigente.socio,
      cuotas,
      total: cuotas.reduce((t, c) => t + c.importe + c.interes, 0),
      vencidas: cuotas.filter((c) => c.estado === 'vencida').length,
    };
  }

  async listar({ q, socioId, parcelaId, page, pageSize }: TransferenciaListar): Promise<Paginado<Transferencia>> {
    const where: Prisma.TransferenciaWhereInput = {
      ...(parcelaId && { parcelaId }),
      ...(socioId && { OR: [{ deSocioId: socioId }, { aSocioId: socioId }] }),
      ...(q && { AND: [{ OR: this.condicionesBusqueda(q) }] }),
    };

    const [total, transferencias] = await this.prisma.$transaction([
      this.prisma.transferencia.count({ where }),
      this.prisma.transferencia.findMany({
        where,
        include: completa,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: transferencias.map(aDTO), total, page, pageSize };
  }

  /** Transferencias en las que participó un socio, cediendo o recibiendo. */
  async deSocio(socioId: number): Promise<Transferencia[]> {
    const transferencias = await this.prisma.transferencia.findMany({
      where: { OR: [{ deSocioId: socioId }, { aSocioId: socioId }] },
      include: completa,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
    return transferencias.map(aDTO);
  }

  /**
   * Pasa la parcela del titular actual a otro socio: cierra una titularidad, abre la
   * siguiente y deja el registro, todo en una transacción.
   *
   * Las cuotas de períodos ya empezados quedan con el saliente —eran suyas cuando se
   * generaron— y las de períodos futuros que estaban impagas pasan al que entra.
   */
  async transferir(parcelaId: number, usuario: UsuarioSesion, datos: TransferenciaCrear): Promise<TransferenciaRealizada> {
    const { id, cuotasMovidas, planFirmado } = await this.prisma.$transaction(async (tx) => {
      const parcela = await tx.parcela.findUnique({
        where: { id: parcelaId },
        include: { asignaciones: { where: { hasta: null }, include: { socio: true } } },
      });
      if (!parcela) throw noEncontrado('No existe la parcela');

      const vigente = parcela.asignaciones[0];
      if (!vigente) {
        throw conflicto(`La parcela ${parcela.codigo} no tiene titular: asignala en lugar de transferirla`);
      }
      if (vigente.socioId === datos.aSocioId) {
        throw conflicto('La parcela ya está a nombre de ese socio', 'aSocioId');
      }

      const destino = await tx.socio.findUnique({ where: { id: datos.aSocioId } });
      if (!destino) throw noEncontrado('No existe el socio que recibe la parcela');
      if (destino.fechaBaja) throw conflicto('No se puede transferir a un socio dado de baja', 'aSocioId');

      const fecha = aFecha(datos.fecha);
      if (fecha < vigente.desde) {
        throw reglaIncumplida(
          `La fecha no puede ser anterior al inicio de la titularidad actual (${fechaLegible(vigente.desde)})`,
          'fecha',
        );
      }
      if (fecha < destino.fechaAlta) {
        throw reglaIncumplida(
          `La fecha no puede ser anterior al alta de ${destino.nombre} ${destino.apellido} (${fechaLegible(destino.fechaAlta)})`,
          'fecha',
        );
      }

      // No se entrega una parcela dejando cuotas impagas sueltas: lo que quedaría con el
      // saliente se refinancia en un plan suyo, firmado en esta misma transacción.
      const planFirmado = await this.refinanciarDeuda(tx, parcelaId, vigente.socioId, usuario, datos);

      // Primero se cierra la titularidad y recién después se abre la nueva: el índice
      // único parcial no admite dos asignaciones vigentes sobre la misma parcela.
      const anterior = await tx.asignacion.update({ where: { id: vigente.id }, data: { hasta: fecha } });
      const nueva = await tx.asignacion.create({
        data: { socioId: datos.aSocioId, parcelaId, desde: fecha },
      });

      const transferencia = await tx.transferencia.create({
        data: {
          parcelaId,
          deSocioId: vigente.socioId,
          aSocioId: datos.aSocioId,
          asignacionAnteriorId: anterior.id,
          asignacionNuevaId: nueva.id,
          fecha,
          motivo: datos.motivo,
          usuarioId: usuario.id,
        },
      });

      // Recibir una parcela convierte al suplente en titular: ya no está en lista de espera.
      if (destino.tipo === 'SUPLENTE') {
        await tx.socio.update({ where: { id: datos.aSocioId }, data: { tipo: 'TITULAR' } });
      }

      // Las cuotas ya generadas de períodos que todavía no empezaron pasan al nuevo
      // titular: no son deuda del saliente. Las vencidas y las pagas no se tocan.
      const { count } = await tx.cuota.updateMany({
        where: {
          asignacionId: anterior.id,
          // La cuota social es del socio, no de la parcela: no se transfiere con ella.
          origen: 'PARCELA',
          estado: 'PENDIENTE',
          periodo: { gte: primerPeriodoDelNuevoTitular(datos.fecha) },
        },
        data: { socioId: datos.aSocioId, asignacionId: nueva.id },
      });

      return { id: transferencia.id, cuotasMovidas: count, planFirmado };
    });

    const creada = await this.prisma.transferencia.findUniqueOrThrow({ where: { id }, include: completa });
    return { ...aDTO(creada), cuotasMovidas, planFirmado };
  }

  /**
   * Refinancia lo que la parcela debe antes de cambiar de manos. Devuelve el número del
   * plan firmado, o null si no había nada que refinanciar. Si hay deuda y la transferencia
   * no trae las condiciones del plan, se rechaza con el detalle: es la confirmación que
   * hace falta para no entregar la parcela dejando cuotas impagas sueltas.
   */
  private async refinanciarDeuda(
    tx: Prisma.TransactionClient,
    parcelaId: number,
    salienteId: number,
    usuario: UsuarioSesion,
    datos: TransferenciaCrear,
  ): Promise<number | null> {
    const corte = primerPeriodoDelNuevoTitular(datos.fecha);
    const impagas = await tx.cuota.findMany({
      where: { parcelaId, origen: 'PARCELA', estado: 'PENDIENTE', periodo: { lt: corte } },
      select: { id: true, importe: true, vencimiento: true, estado: true, origen: true },
    });
    if (impagas.length === 0) return null;

    const hoyISO = hoy();
    const config = await this.interes.vigente();
    const total = impagas.reduce(
      (t, c) => t + c.importe + interesDeCuota({ ...c, vencimiento: deFecha(c.vencimiento) }, config, hoyISO),
      0,
    );

    if (!datos.plan) {
      throw conflicto(
        `La parcela tiene ${impagas.length === 1 ? 'una cuota impaga' : `${impagas.length} cuotas impagas`} ` +
          `por ${pesos(total)} que quedan con el titular actual. Refinanciá esa deuda en un plan de pago ` +
          'para poder transferirla.',
        'plan',
      );
    }

    const id = await this.planes.crearEn(tx, usuario, {
      socioId: salienteId,
      cuotaIds: impagas.map((c) => c.id),
      fecha: datos.fecha,
      cantidadCuotas: datos.plan.cantidadCuotas,
      anticipo: datos.plan.anticipo,
      primerVencimiento: datos.plan.primerVencimiento,
      toleranciaVencidas: datos.plan.toleranciaVencidas,
      observaciones: datos.plan.observaciones,
    });
    const { numero } = await tx.planPago.findUniqueOrThrow({ where: { id }, select: { numero: true } });
    return numero;
  }

  private condicionesBusqueda(q: string): Prisma.TransferenciaWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const porNombre = (campo: 'deSocio' | 'aSocio'): Prisma.TransferenciaWhereInput => ({
      [campo]: {
        AND: palabras.map((p) => ({
          OR: [
            { nombre: { contains: p, mode: 'insensitive' as const } },
            { apellido: { contains: p, mode: 'insensitive' as const } },
          ],
        })),
      },
    });

    return [
      porNombre('deSocio'),
      porNombre('aSocio'),
      { parcela: { codigo: { contains: q, mode: 'insensitive' } } },
    ];
  }
}

const aDTO = (t: TransferenciaCompleta): Transferencia => ({
  id: t.id,
  fecha: deFecha(t.fecha),
  parcela: aParcelaUbicada(t.parcela),
  de: t.deSocio,
  a: t.aSocio,
  motivo: t.motivo,
  registradaPor: t.usuario.nombre,
  registradaEn: t.createdAt.toISOString(),
});

