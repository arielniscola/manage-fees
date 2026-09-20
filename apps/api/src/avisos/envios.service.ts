import { Injectable } from '@nestjs/common';
import type { EnvioListar, EnvioListItem, EnviosPaginados, ResultadoEnvio } from '@mf/shared';
import { Prisma } from '@prisma/client';
import { aFecha, deFecha } from '../common/fechas';
import { PrismaService } from '../prisma/prisma.module';

const conSocio = {
  socio: { select: { id: true, numero: true, nombre: true, apellido: true, telefono: true } },
} satisfies Prisma.EnvioAvisoInclude;

type EnvioCompleto = Prisma.EnvioAvisoGetPayload<{ include: typeof conSocio }>;

/** Historial de avisos. Filtrando por `SIN_EMAIL` sale el listado de socios a contactar. */
@Injectable()
export class EnviosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ q, socioId, tipo, resultado, desde, hasta, page, pageSize }: EnvioListar): Promise<EnviosPaginados> {
    const where: Prisma.EnvioAvisoWhereInput = {
      ...(socioId && { socioId }),
      ...(tipo && { tipo }),
      ...(resultado && { resultado }),
      ...((desde || hasta) && {
        fecha: { ...(desde && { gte: aFecha(desde) }), ...(hasta && { lte: aFecha(hasta) }) },
      }),
      ...(q && { OR: this.condicionesBusqueda(q) }),
    };
    // El resumen no mira el filtro de resultado: muestra cómo salió todo lo demás.
    const { resultado: _, ...whereResumen } = where;

    const [total, envios] = await this.prisma.$transaction([
      this.prisma.envioAviso.count({ where }),
      this.prisma.envioAviso.findMany({
        where,
        include: conSocio,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const porResultado = await this.prisma.envioAviso.groupBy({
      by: ['resultado'],
      where: whereResumen,
      _count: true,
    });
    const cuenta = (r: ResultadoEnvio) => porResultado.find((x) => x.resultado === r)?._count ?? 0;
    return {
      items: envios.map((e) => this.aListItem(e)),
      total,
      page,
      pageSize,
      resumen: { enviados: cuenta('ENVIADO'), fallidos: cuenta('FALLIDO'), sinEmail: cuenta('SIN_EMAIL') },
    };
  }

  private condicionesBusqueda(q: string): Prisma.EnvioAvisoWhereInput[] {
    const palabras = q.split(/\s+/).filter(Boolean);
    const condiciones: Prisma.EnvioAvisoWhereInput[] = [
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
      { email: { contains: q, mode: 'insensitive' } },
    ];

    const digitos = q.replace(/[.\s-]/g, '');
    if (/^\d+$/.test(digitos)) {
      const n = Number(digitos);
      condiciones.push({ socio: { dni: { contains: digitos } } });
      if (Number.isSafeInteger(n) && n <= 2_147_483_647) condiciones.push({ socio: { numero: n } });
    }
    return condiciones;
  }

  private aListItem(e: EnvioCompleto): EnvioListItem {
    return {
      id: e.id,
      fecha: deFecha(e.fecha),
      tipo: e.tipo,
      socio: e.socio,
      email: e.email,
      asunto: e.asunto,
      cantidadCuotas: e.cuotaIds.length,
      importe: e.importe,
      resultado: e.resultado,
      error: e.error,
      intentos: e.intentos,
      enviadoEn: e.enviadoEn?.toISOString() ?? null,
    };
  }
}
