import { Injectable } from '@nestjs/common';
import type { AsignacionCrear, AsignacionLiberar } from '@mf/shared';
import { conflicto, noEncontrado, reglaIncumplida } from '../common/errores';
import { aFecha, deFecha, deFechaNullable, fechaLegible } from '../common/fechas';
import { esDuplicado, PrismaService } from '../prisma/prisma.module';

@Injectable()
export class AsignacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async asignar(socioId: number, { parcelaId, desde }: AsignacionCrear) {
    const [socio, parcela] = await Promise.all([
      this.prisma.socio.findUnique({ where: { id: socioId } }),
      this.prisma.parcela.findUnique({
        where: { id: parcelaId },
        include: {
          asignaciones: { orderBy: { desde: 'desc' }, take: 1, include: { socio: true } },
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
