import { Injectable } from '@nestjs/common';
import {
  numeroDevolucion,
  textoMotivoDevolucion,
  type DatosDevolucion,
  type DatosRecibo,
  type DevolucionAnular,
  type DevolucionCrear,
  type DevolucionDetalle,
  type DevolucionesPaginadas,
  type DevolucionListar,
  type DevolucionListItem,
  type UsuarioSesion,
} from '@mf/shared';
import { Prisma, type EstadoCuota } from '@prisma/client';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha, fechaLegible } from '../common/fechas';
import { cobrosDelLoteo } from '../common/loteo';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';
import { concepto } from './cobros.service';
import { renderizarDevolucion } from './devolucion.pdf';

const NOMBRE_CLUB = process.env.CLUB_NOMBRE || 'Cooperativa';

const completa = {
  usuario: { select: { nombre: true } },
  anuladaPor: { select: { nombre: true } },
  cobro: {
    select: {
      id: true,
      fecha: true,
      socio: { select: { id: true, numero: true, nombre: true, apellido: true, dni: true } },
      recibo: { select: { numero: true } },
      _count: { select: { detalles: true } },
    },
  },
} satisfies Prisma.DevolucionInclude;

type DevolucionCompleta = Prisma.DevolucionGetPayload<{ include: typeof completa }>;

/** Las cuotas del cobro, con lo necesario para nombrarlas en un mensaje. */
const cuotasDelCobro = {
  detalles: {
    include: { cuota: { include: { plan: { select: { id: true, numero: true, cantidadCuotas: true } } } } },
  },
} satisfies Prisma.CobroInclude;

@Injectable()
export class DevolucionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ q, socioId, desde, hasta, medio, estado, loteoId, page, pageSize, orden, dir }: DevolucionListar): Promise<DevolucionesPaginadas> {
    const delCobro: Prisma.CobroWhereInput[] = [
      ...(socioId ? [{ socioId }] : []),
      ...(loteoId ? [cobrosDelLoteo(loteoId)] : []),
    ];
    const where: Prisma.DevolucionWhereInput = {
      ...(delCobro.length > 0 && { cobro: { AND: delCobro } }),
      ...(medio && { medio }),
      ...(estado === 'vigentes' && { anuladaEn: null }),
      ...(estado === 'anuladas' && { anuladaEn: { not: null } }),
      ...((desde || hasta) && {
        fecha: { ...(desde && { gte: aFecha(desde) }), ...(hasta && { lte: aFecha(hasta) }) },
      }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
    };

    const [total, devoluciones, suma] = await this.prisma.$transaction([
      this.prisma.devolucion.count({ where }),
      this.prisma.devolucion.findMany({
        where,
        include: completa,
        orderBy: this.ordenDeDevoluciones(orden, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // Como en los cobros: el resumen suma todo lo filtrado y deja afuera las anuladas.
      this.prisma.devolucion.aggregate({ where: { ...where, anuladaEn: null }, _sum: { importe: true }, _count: true }),
    ]);

    return {
      items: devoluciones.map((d) => this.aListItem(d)),
      total,
      page,
      pageSize,
      resumen: { devoluciones: suma._count, total: suma._sum.importe ?? 0 },
    };
  }

  async obtener(id: number): Promise<DevolucionDetalle> {
    const d = await this.prisma.devolucion.findUnique({ where: { id }, include: completa });
    if (!d) throw noEncontrado('No existe la devolución');
    return { ...this.aListItem(d), anuladaPor: d.anuladaPor?.nombre ?? null };
  }

  /**
   * Devuelve al socio el dinero de un cobro entero y emite el comprobante, todo en una
   * transacción. Las cuotas del cobro vuelven a pendiente o quedan anuladas, según se
   * elija; las de un plan de pago solo pueden volver a pendiente. El cobro no se toca:
   * sigue contando el día que entró, y la devolución resta el día que salió.
   */
  async registrar(cobroId: number, usuario: UsuarioSesion, datos: DevolucionCrear): Promise<DevolucionDetalle> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const cobro = await tx.cobro.findUnique({
          where: { id: cobroId },
          include: { ...cuotasDelCobro, socio: true, recibo: true },
        });
        if (!cobro) throw noEncontrado('No existe el cobro');
        if (cobro.anuladoEn) throw conflicto('El cobro está anulado: no hay dinero que devolver');
        if (!cobro.recibo) throw conflicto('El cobro no tiene recibo emitido');

        const vigente = await tx.devolucion.findFirst({ where: { cobroId, anuladaEn: null }, select: { numero: true } });
        if (vigente) throw conflicto(`El cobro ya tiene la devolución N° ${numeroDevolucion(vigente.numero)}`);

        const elegido = await tx.motivoDevolucion.findUnique({ where: { id: datos.motivoId } });
        if (!elegido) throw reglaIncumplida('El motivo elegido no existe', 'motivoId');
        if (!elegido.activo) throw reglaIncumplida(`El motivo «${elegido.nombre}» está desactivado`, 'motivoId');
        const motivo = textoMotivoDevolucion(elegido.nombre, datos.detalle);

        const fecha = aFecha(datos.fecha);
        if (fecha < cobro.fecha) {
          throw reglaIncumplida(`La devolución no puede ser anterior al cobro (${fechaLegible(cobro.fecha)})`, 'fecha');
        }

        const cuotas = cobro.detalles.map((d) => d.cuota);
        if (datos.destinoCuotas === 'ANULADA') {
          const delPlan = cuotas.find((c) => c.origen === 'PLAN');
          if (delPlan) {
            throw reglaIncumplida(
              `El cobro incluye la cuota ${concepto(delPlan)}: las cuotas de un plan de pago solo pueden volver a pendiente`,
              'destinoCuotas',
            );
          }
        }

        const numero = await this.siguienteNumero(tx);
        const ids = cuotas.map((c) => c.id);
        // Solo las que siguen pagadas: si alguna cambió, el conteo no coincide y se vuelve atrás.
        const { count } = await tx.cuota.updateMany({
          where: { id: { in: ids }, estado: 'PAGADA' },
          data:
            datos.destinoCuotas === 'ANULADA'
              ? {
                  estado: 'ANULADA',
                  anuladaEn: new Date(),
                  motivoAnulacion: `Devolución N° ${numeroDevolucion(numero)}: ${motivo}`,
                }
              : { estado: 'PENDIENTE' },
        });
        if (count !== ids.length) {
          throw conflicto('Alguna de las cuotas del cobro ya no figura como pagada. Revisá el cobro y volvé a intentarlo.');
        }

        const recibo = cobro.recibo.datos as unknown as DatosRecibo;
        const emitidoEn = new Date();
        const snapshot: DatosDevolucion = {
          numero,
          emitidoEn: emitidoEn.toISOString(),
          fecha: datos.fecha,
          club: NOMBRE_CLUB,
          socio: {
            numero: cobro.socio.numero,
            nombre: cobro.socio.nombre,
            apellido: cobro.socio.apellido,
            dni: cobro.socio.dni,
            direccion: cobro.socio.direccion,
          },
          medio: datos.medio,
          motivo,
          destinoCuotas: datos.destinoCuotas,
          recibo: { numero: cobro.recibo.numero, fecha: deFecha(cobro.fecha) },
          detalles: recibo.detalles,
          total: cobro.total,
          registradoPor: usuario.nombre,
        };

        const creada = await tx.devolucion.create({
          data: {
            numero,
            cobroId,
            fecha,
            medio: datos.medio,
            importe: cobro.total,
            motivoDevolucionId: elegido.id,
            motivo,
            destinoCuotas: datos.destinoCuotas,
            usuarioId: usuario.id,
            emitidoEn,
            datos: snapshot as unknown as Prisma.InputJsonValue,
          },
        });
        return creada.id;
      });
      return this.obtener(id);
    } catch (e) {
      // Índice único parcial: otra pantalla registró la devolución al mismo tiempo.
      if (esDuplicado(e)) throw conflicto('El cobro ya tiene una devolución registrada');
      throw e;
    }
  }

  /**
   * Anula una devolución mal cargada: el comprobante queda marcado como anulado y las
   * cuotas del cobro vuelven a pagadas. Solo si siguen como las dejó la devolución: una
   * que después se volvió a cobrar o se refinanció tiene que revertirse primero.
   */
  async anular(id: number, usuario: UsuarioSesion, { motivo }: DevolucionAnular): Promise<DevolucionDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const devolucion = await tx.devolucion.findUnique({ where: { id }, include: { cobro: { include: cuotasDelCobro } } });
      if (!devolucion) throw noEncontrado('No existe la devolución');
      if (devolucion.anuladaEn) throw conflicto('La devolución ya está anulada');

      const esperado: EstadoCuota = devolucion.destinoCuotas;
      const cuotas = devolucion.cobro.detalles.map((d) => d.cuota);
      const cambiada = cuotas.find((c) => c.estado !== esperado);
      if (cambiada) {
        const como = {
          PAGADA: 'se volvió a cobrar en otro recibo',
          REFINANCIADA: 'se refinanció en un plan de pago',
          ANULADA: 'se anuló',
          PENDIENTE: 'volvió a pendiente',
        }[cambiada.estado];
        throw conflicto(`No se puede anular: la cuota ${concepto(cambiada)} ${como} después de la devolución. Revertí eso primero.`);
      }

      const ids = cuotas.map((c) => c.id);
      const { count } = await tx.cuota.updateMany({
        where: { id: { in: ids }, estado: esperado },
        data: { estado: 'PAGADA', ...(esperado === 'ANULADA' && { anuladaEn: null, motivoAnulacion: null }) },
      });
      if (count !== ids.length) {
        throw conflicto('Alguna de las cuotas cambió desde otra pantalla. Revisá el cobro y volvé a intentarlo.');
      }
      await tx.devolucion.update({
        where: { id },
        data: { anuladaEn: new Date(), anuladaPorId: usuario.id, motivoAnulacion: motivo },
      });
    });

    return this.obtener(id);
  }

  /** El comprobante en PDF, armado siempre con el snapshot guardado al emitirlo. */
  async pdf(id: number): Promise<{ nombre: string; pdf: Buffer }> {
    const d = await this.prisma.devolucion.findUnique({ where: { id }, select: { numero: true, datos: true, anuladaEn: true } });
    if (!d) throw noEncontrado('No existe la devolución');
    return {
      nombre: `devolucion-${numeroDevolucion(d.numero)}.pdf`,
      pdf: await renderizarDevolucion(d.datos as unknown as DatosDevolucion, d.anuladaEn !== null),
    };
  }

  /** Igual que el de recibos: el UPDATE bloquea la fila y un error hace retroceder el número. */
  private async siguienteNumero(tx: Prisma.TransactionClient): Promise<number> {
    const filas = await tx.$queryRaw<{ valor: number }[]>`
      UPDATE "Contador" SET valor = valor + 1 WHERE nombre = 'devolucion' RETURNING valor
    `;
    const valor = filas[0]?.valor;
    if (valor === undefined) throw new Error('Falta el contador de devoluciones en la base');
    return valor;
  }

  private ordenDeDevoluciones(
    orden: DevolucionListar['orden'],
    dir: DevolucionListar['dir'] = 'asc',
  ): Prisma.DevolucionOrderByWithRelationInput[] {
    switch (orden) {
      case 'numero':
        return [{ numero: dir }];
      case 'fecha':
        return [{ fecha: dir }, { id: dir }];
      case 'socio':
        return [{ cobro: { socio: { apellido: dir } } }, { cobro: { socio: { nombre: dir } } }, { fecha: 'desc' }, { id: 'desc' }];
      case 'importe':
        return [{ importe: dir }, { fecha: 'desc' }, { id: 'desc' }];
      default:
        return [{ fecha: 'desc' }, { id: 'desc' }];
    }
  }

  private condicionesBusqueda(q: string): Prisma.DevolucionWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.DevolucionWhereInput[] = [
      {
        cobro: {
          socio: {
            AND: palabras.map((p) => ({
              OR: [
                { nombre: { contains: p, mode: 'insensitive' as const } },
                { apellido: { contains: p, mode: 'insensitive' as const } },
              ],
            })),
          },
        },
      },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      const numero = Number(digitos);
      condiciones.push({ cobro: { socio: { dni: { contains: digitos } } } });
      if (Number.isSafeInteger(numero) && numero <= 2_147_483_647) {
        condiciones.push({ cobro: { socio: { numero } } });
        // Por número de comprobante o del recibo devuelto, con o sin los ceros de adelante.
        condiciones.push({ numero });
        condiciones.push({ cobro: { recibo: { numero } } });
      }
    }
    return condiciones;
  }

  private aListItem(d: DevolucionCompleta): DevolucionListItem {
    return {
      id: d.id,
      numero: d.numero,
      fecha: deFecha(d.fecha),
      medio: d.medio,
      importe: d.importe,
      motivo: d.motivo,
      destinoCuotas: d.destinoCuotas,
      socio: d.cobro.socio,
      cobro: { id: d.cobro.id, numeroRecibo: d.cobro.recibo?.numero ?? 0, fecha: deFecha(d.cobro.fecha) },
      cantidadCuotas: d.cobro._count.detalles,
      anulada: d.anuladaEn !== null,
      anuladaEn: d.anuladaEn?.toISOString() ?? null,
      motivoAnulacion: d.motivoAnulacion,
      registradoPor: d.usuario.nombre,
    };
  }
}
