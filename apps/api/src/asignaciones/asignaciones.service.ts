import { Injectable } from '@nestjs/common';
import { mesDe, type AnticipoEntrada, type AsignacionCrear, type AsignacionLiberar } from '@mf/shared';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha, deFechaNullable, fechaLegible } from '../common/fechas';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

@Injectable()
export class AsignacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Si el loteo de la parcela cobra anticipo de entrada, la asignación lo trae y se genera
   * su cuota en la misma transacción: o queda la parcela asignada con su anticipo, o nada.
   */
  async asignar(socioId: number, { parcelaId, desde, anticipo }: AsignacionCrear) {
    const [socio, parcela] = await Promise.all([
      this.prisma.socio.findUnique({ where: { id: socioId } }),
      this.prisma.parcela.findUnique({
        where: { id: parcelaId },
        include: {
          asignaciones: { orderBy: { desde: 'desc' }, take: 1, include: { socio: true } },
          sector: { select: { loteo: { select: { nombre: true, cobraAnticipo: true } } } },
        },
      }),
    ]);
    if (!socio) throw noEncontrado('No existe el socio');
    if (!parcela) throw noEncontrado('No existe la parcela');
    if (socio.fechaBaja) throw conflicto('No se pueden asignar parcelas a un socio dado de baja');

    const ultima = parcela.asignaciones[0];
    if (ultima && ultima.hasta === null) {
      const titular = ultima.socioId === socioId ? 'este socio' : `${ultima.socio.nombre} ${ultima.socio.apellido}`;
      throw conflicto(`La parcela ${parcela.codigo} ya está asignada a ${titular}`, 'parcelaId');
    }

    const loteo = parcela.sector?.loteo;
    if (loteo?.cobraAnticipo && !anticipo) {
      throw reglaIncumplida(`El loteo ${loteo.nombre} cobra anticipo de entrada: ingresá su importe`, 'anticipo.importe');
    }
    if (!loteo?.cobraAnticipo && anticipo) {
      throw reglaIncumplida('El loteo de la parcela no cobra anticipo de entrada', 'anticipo.importe');
    }

    const inicio = aFecha(desde);
    if (inicio < socio.fechaAlta) {
      throw reglaIncumplida(`La fecha no puede ser anterior al alta del socio (${fechaLegible(socio.fechaAlta)})`, 'desde');
    }
    if (ultima?.hasta && inicio < ultima.hasta) {
      throw reglaIncumplida(`La parcela estuvo asignada hasta el ${fechaLegible(ultima.hasta)}; elegí una fecha posterior`, 'desde');
    }

    try {
      const a = await this.prisma.$transaction(async (tx) => {
        const creada = await tx.asignacion.create({ data: { socioId, parcelaId, desde: inicio } });
        if (anticipo) {
          await tx.cuota.create({
            data: {
              origen: 'ANTICIPO',
              socioId,
              asignacionId: creada.id,
              parcelaId,
              periodo: mesDe(desde),
              periodicidad: 'MENSUAL',
              importe: anticipo.importe,
              vencimiento: aFecha(anticipo.vencimiento),
            },
          });
        }
        // Recibir una parcela convierte al suplente en titular: deja la lista de espera.
        if (socio.tipo === 'SUPLENTE') await tx.socio.update({ where: { id: socioId }, data: { tipo: 'TITULAR' } });
        return creada;
      });
      return { id: a.id, socioId, parcelaId, desde: deFecha(a.desde), hasta: null };
    } catch (e) {
      // Índice único parcial: otra operación asignó la parcela al mismo tiempo.
      if (esDuplicado(e)) throw conflicto(`La parcela ${parcela.codigo} ya está asignada`, 'parcelaId');
      throw e;
    }
  }

  /**
   * Carga el anticipo de entrada de una asignación vigente que quedó sin él: la parcela se
   * asignó antes de que el loteo lo cobrara, o vino de una importación.
   */
  async cargarAnticipo(id: number, { importe, vencimiento }: AnticipoEntrada) {
    const a = await this.prisma.asignacion.findUnique({
      where: { id },
      include: {
        parcela: { select: { codigo: true, sector: { select: { loteo: { select: { nombre: true, cobraAnticipo: true } } } } } },
        cuotas: { where: { origen: 'ANTICIPO' }, select: { estado: true } },
      },
    });
    if (!a) throw noEncontrado('No existe la asignación');
    if (a.hasta) throw conflicto('La parcela ya fue liberada');

    const loteo = a.parcela.sector?.loteo;
    if (!loteo?.cobraAnticipo) throw reglaIncumplida('El loteo de la parcela no cobra anticipo de entrada', 'importe');

    const existente = a.cuotas[0];
    if (existente) {
      throw conflicto(
        existente.estado === 'ANULADA'
          ? `La parcela ${a.parcela.codigo} ya tuvo un anticipo, que está anulado: eliminá esa cuota para cargar otro`
          : `La parcela ${a.parcela.codigo} ya tiene su anticipo cargado`,
      );
    }

    const vence = aFecha(vencimiento);
    if (vence < a.desde) {
      throw reglaIncumplida(`El vencimiento no puede ser anterior a la asignación (${fechaLegible(a.desde)})`, 'vencimiento');
    }

    try {
      const cuota = await this.prisma.cuota.create({
        data: {
          origen: 'ANTICIPO',
          socioId: a.socioId,
          asignacionId: a.id,
          parcelaId: a.parcelaId,
          periodo: mesDe(deFecha(a.desde)),
          periodicidad: 'MENSUAL',
          importe,
          vencimiento: vence,
        },
      });
      return { id: cuota.id, asignacionId: a.id, importe, vencimiento };
    } catch (e) {
      // Índice único parcial: otra operación cargó el anticipo al mismo tiempo.
      if (esDuplicado(e)) throw conflicto(`La parcela ${a.parcela.codigo} ya tiene su anticipo cargado`);
      throw e;
    }
  }

  async liberar(id: number, { hasta }: AsignacionLiberar) {
    const a = await this.prisma.asignacion.findUnique({ where: { id } });
    if (!a) throw noEncontrado('No existe la asignación');
    if (a.hasta) throw conflicto('La parcela ya fue liberada');

    const fin = aFecha(hasta);
    if (fin < a.desde) {
      throw reglaIncumplida(`La fecha no puede ser anterior a la asignación (${fechaLegible(a.desde)})`, 'hasta');
    }

    const actualizada = await this.prisma.asignacion.update({ where: { id }, data: { hasta: fin } });
    return {
      id: actualizada.id,
      socioId: actualizada.socioId,
      parcelaId: actualizada.parcelaId,
      desde: deFecha(actualizada.desde),
      hasta: deFechaNullable(actualizada.hasta),
    };
  }
}
