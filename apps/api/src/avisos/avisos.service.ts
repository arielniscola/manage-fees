import { Injectable, Logger } from '@nestjs/common';
import {
  ASUNTO_PROXIMO_POR_DEFECTO,
  ASUNTO_VENCIDA_POR_DEFECTO,
  CUERPO_PROXIMO_POR_DEFECTO,
  CUERPO_VENCIDA_POR_DEFECTO,
  MAX_INTENTOS,
  conceptoCuota,
  hoy,
  pesos,
  renderizarPlantilla,
  type AvisoPrueba,
  type ConfiguracionAvisos,
  type ConfiguracionAvisosCompleta,
  type DatosPlantilla,
  type EjecutarAvisos,
  type ResultadoAvisos,
  type TipoAviso,
} from '@mf/shared';
import type { ConfiguracionAvisos as ConfigFila, Prisma } from '@prisma/client';
import { aParcelaUbicada, parcelaResumen } from '../common/parcela';
import { conflicto } from '../common/errores';
import { aFecha, deFecha, fechaLegible } from '../common/fechas';
import { PrismaService } from '../prisma/prisma.module';
import { CorreoService } from './correo.service';

const NOMBRE_CLUB = process.env.CLUB_NOMBRE || 'Club';

const conDatos = {
  socio: { select: { id: true, numero: true, nombre: true, apellido: true, email: true } },
  parcela: parcelaResumen,
  plan: { select: { id: true, numero: true, cantidadCuotas: true } },
} satisfies Prisma.CuotaInclude;

type CuotaParaAviso = Prisma.CuotaGetPayload<{ include: typeof conDatos }>;

/** Lo que se le manda a un socio en una corrida: sus cuotas de ese tipo, juntas. */
interface Aviso {
  socio: CuotaParaAviso['socio'];
  tipo: TipoAviso;
  cuotas: CuotaParaAviso[];
  dias: number;
}

@Injectable()
export class AvisosService {
  private readonly log = new Logger('Avisos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: CorreoService,
  ) {}

  // ---------------------------------------------------------------- Configuración

  async configuracion(): Promise<ConfiguracionAvisosCompleta> {
    return this.aConfigDTO(await this.fila());
  }

  async guardarConfiguracion(datos: ConfiguracionAvisos): Promise<ConfiguracionAvisosCompleta> {
    if (datos.activo && !this.correo.configurado) {
      throw conflicto('Para activar los avisos hace falta configurar el SMTP en el servidor');
    }
    const fila = await this.prisma.configuracionAvisos.update({ where: { id: 1 }, data: datos });
    return this.aConfigDTO(fila);
  }

  /** Manda un correo de muestra con datos inventados, para probar el SMTP y ver el texto. */
  async probar({ email, tipo }: AvisoPrueba): Promise<void> {
    const config = await this.fila();
    const proximo = tipo === 'PROXIMO_VENCIMIENTO';
    const datos: DatosPlantilla = {
      socio: 'Nombre de prueba',
      club: NOMBRE_CLUB,
      cantidad: 2,
      total: 2400000,
      detalle: [
        `Parcela A-001 · septiembre 2026 · vence ${fechaLegible(hoy())} · ${pesos(1200000)}`,
        `Parcela A-002 · septiembre 2026 · vence ${fechaLegible(hoy())} · ${pesos(1200000)}`,
      ],
      vencimiento: fechaLegible(hoy()),
      dias: proximo ? config.diasAntes : config.diasDespues,
    };

    await this.correo.enviar({
      para: email,
      asunto: `[PRUEBA] ${renderizarPlantilla(proximo ? config.asuntoProximo : config.asuntoVencida, datos)}`,
      texto: renderizarPlantilla(proximo ? config.cuerpoProximo : config.cuerpoVencida, datos),
      remitenteNombre: config.remitenteNombre,
    });
  }

  // ---------------------------------------------------------------- Proceso diario

  /**
   * Busca las cuotas que vencen en X días y las que vencieron hace Y, arma un solo correo
   * por socio y deja constancia de cada envío. Antes reintenta los avisos que fallaron
   * en días anteriores.
   */
  async ejecutar({ simular }: EjecutarAvisos): Promise<ResultadoAvisos> {
    const config = await this.fila();
    const fecha = hoy();
    const base: ResultadoAvisos = {
      fecha,
      simulado: simular,
      inactivo: !config.activo,
      sinSmtp: !this.correo.configurado,
      proximos: 0,
      vencidas: 0,
      enviados: 0,
      fallidos: 0,
      sinEmail: 0,
      reintentos: 0,
      destinatarios: [],
    };
    if (!config.activo || !this.correo.configurado) return base;

    const avisos = [
      ...(await this.buscar('PROXIMO_VENCIMIENTO', config.diasAntes, fecha)),
      ...(config.diasDespues > 0 ? await this.buscar('CUOTA_VENCIDA', -config.diasDespues, fecha) : []),
    ];

    base.proximos = avisos.filter((a) => a.tipo === 'PROXIMO_VENCIMIENTO').length;
    base.vencidas = avisos.filter((a) => a.tipo === 'CUOTA_VENCIDA').length;
    base.destinatarios = avisos.map((a) => ({
      socio: { id: a.socio.id, numero: a.socio.numero, nombre: a.socio.nombre, apellido: a.socio.apellido },
      tipo: a.tipo,
      email: a.socio.email,
      cantidadCuotas: a.cuotas.length,
      importe: a.cuotas.reduce((t, c) => t + c.importe, 0),
    }));

    if (simular) return base;

    base.reintentos = await this.reintentarFallidos(config);

    for (const aviso of avisos) {
      const resultado = await this.enviarAviso(aviso, config, fecha);
      if (resultado === 'ENVIADO') base.enviados += 1;
      else if (resultado === 'FALLIDO') base.fallidos += 1;
      else if (resultado === 'SIN_EMAIL') base.sinEmail += 1;
    }

    await this.prisma.configuracionAvisos.update({ where: { id: 1 }, data: { ultimaCorrida: aFecha(fecha) } });
    this.log.log(
      `Avisos del ${fecha}: ${base.enviados} enviados, ${base.fallidos} fallidos, ${base.sinEmail} sin email, ${base.reintentos} reintentos`,
    );
    return base;
  }

  /** ¿Le toca correr al proceso automático en este momento? */
  async correspondeCorrer(horaActual: number): Promise<boolean> {
    const config = await this.fila();
    if (!config.activo) return false;
    if (config.horaEnvio !== horaActual) return false;
    return !config.ultimaCorrida || deFecha(config.ultimaCorrida) < hoy();
  }

  /**
   * Cuotas impagas que vencen exactamente dentro de `dias` (negativo = hace `dias` que
   * vencieron), agrupadas por socio. Un socio con tres parcelas recibe un solo correo.
   */
  private async buscar(tipo: TipoAviso, dias: number, fecha: string): Promise<Aviso[]> {
    const objetivo = sumarDias(fecha, dias);
    const cuotas = await this.prisma.cuota.findMany({
      where: {
        estado: 'PENDIENTE',
        vencimiento: aFecha(objetivo),
        // A un socio dado de baja no se le manda nada.
        socio: { fechaBaja: null },
      },
      include: conDatos,
      orderBy: [{ parcela: { codigo: 'asc' } }, { numeroEnPlan: 'asc' }],
    });

    const porSocio = new Map<number, Aviso>();
    for (const c of cuotas) {
      const actual = porSocio.get(c.socioId);
      if (actual) actual.cuotas.push(c);
      else porSocio.set(c.socioId, { socio: c.socio, tipo, cuotas: [c], dias: Math.abs(dias) });
    }
    return [...porSocio.values()];
  }

  /** Manda un aviso y lo registra. Si ya se registró hoy, no hace nada. */
  private async enviarAviso(aviso: Aviso, config: ConfigFila, fecha: string): Promise<string | null> {
    const ya = await this.prisma.envioAviso.findUnique({
      where: { socioId_tipo_fecha: { socioId: aviso.socio.id, tipo: aviso.tipo, fecha: aFecha(fecha) } },
    });
    if (ya) return null;

    const proximo = aviso.tipo === 'PROXIMO_VENCIMIENTO';
    const datos = this.datosDePlantilla(aviso);
    const asunto = renderizarPlantilla(proximo ? config.asuntoProximo : config.asuntoVencida, datos);
    const texto = renderizarPlantilla(proximo ? config.cuerpoProximo : config.cuerpoVencida, datos);

    const registro = {
      socioId: aviso.socio.id,
      tipo: aviso.tipo,
      fecha: aFecha(fecha),
      email: aviso.socio.email,
      asunto,
      cuotaIds: aviso.cuotas.map((c) => c.id),
      importe: datos.total,
    };

    if (!aviso.socio.email) {
      await this.prisma.envioAviso.create({
        data: { ...registro, resultado: 'SIN_EMAIL', error: 'El socio no tiene email cargado' },
      });
      return 'SIN_EMAIL';
    }

    try {
      await this.correo.enviar({
        para: aviso.socio.email,
        asunto,
        texto,
        copiaOculta: config.copiaOculta,
        remitenteNombre: config.remitenteNombre,
      });
      await this.prisma.envioAviso.create({ data: { ...registro, resultado: 'ENVIADO', enviadoEn: new Date() } });
      return 'ENVIADO';
    } catch (e) {
      await this.prisma.envioAviso.create({
        data: { ...registro, resultado: 'FALLIDO', error: mensajeDeError(e) },
      });
      return 'FALLIDO';
    }
  }

  /**
   * Reintenta los avisos que fallaron en días anteriores, con las mismas cuotas. Si el
   * socio ya las pagó, deja de reintentarlo y lo deja anotado.
   */
  private async reintentarFallidos(config: ConfigFila): Promise<number> {
    const pendientes = await this.prisma.envioAviso.findMany({
      where: { resultado: 'FALLIDO', intentos: { lt: MAX_INTENTOS }, fecha: { lt: aFecha(hoy()) } },
      include: { socio: { select: { id: true, numero: true, nombre: true, apellido: true, email: true } } },
      orderBy: { fecha: 'asc' },
      take: 200,
    });

    let hechos = 0;
    for (const envio of pendientes) {
      const cuotas = await this.prisma.cuota.findMany({
        where: { id: { in: envio.cuotaIds }, estado: 'PENDIENTE' },
        include: conDatos,
      });

      if (cuotas.length === 0) {
        await this.prisma.envioAviso.update({
          where: { id: envio.id },
          data: { intentos: MAX_INTENTOS, error: 'No se reintenta: esas cuotas ya no están impagas' },
        });
        continue;
      }
      if (!envio.email) continue;

      const proximo = envio.tipo === 'PROXIMO_VENCIMIENTO';
      const datos = this.datosDePlantilla({
        socio: envio.socio,
        tipo: envio.tipo,
        cuotas,
        dias: proximo ? config.diasAntes : config.diasDespues,
      });

      try {
        await this.correo.enviar({
          para: envio.email,
          asunto: envio.asunto,
          texto: renderizarPlantilla(proximo ? config.cuerpoProximo : config.cuerpoVencida, datos),
          copiaOculta: config.copiaOculta,
          remitenteNombre: config.remitenteNombre,
        });
        await this.prisma.envioAviso.update({
          where: { id: envio.id },
          data: { resultado: 'ENVIADO', enviadoEn: new Date(), error: null, intentos: { increment: 1 } },
        });
        hechos += 1;
      } catch (e) {
        await this.prisma.envioAviso.update({
          where: { id: envio.id },
          data: { error: mensajeDeError(e), intentos: { increment: 1 } },
        });
      }
    }
    return hechos;
  }

  private datosDePlantilla(aviso: Aviso): DatosPlantilla {
    const vencimientos = aviso.cuotas.map((c) => deFecha(c.vencimiento)).sort();
    return {
      socio: `${aviso.socio.nombre} ${aviso.socio.apellido}`,
      club: NOMBRE_CLUB,
      cantidad: aviso.cuotas.length,
      total: aviso.cuotas.reduce((t, c) => t + c.importe, 0),
      detalle: aviso.cuotas.map((c) => this.linea(c)),
      vencimiento: fechaLegible(vencimientos[0]),
      dias: aviso.dias,
    };
  }

  /** Una línea por cuota: de dónde sale, cuándo vence y cuánto es. */
  private linea(c: CuotaParaAviso): string {
    const concepto = conceptoCuota({
      origen: c.origen,
      periodo: c.periodo,
      periodicidad: c.periodicidad,
      plan: c.plan && c.numeroEnPlan !== null
        ? { id: c.plan.id, numero: c.plan.numero, cuotaNumero: c.numeroEnPlan, cantidadCuotas: c.plan.cantidadCuotas }
        : null,
    });
    const donde = c.parcela ? `Parcela ${aParcelaUbicada(c.parcela).etiqueta} · ` : '';
    return `${donde}${concepto} · vence ${fechaLegible(deFecha(c.vencimiento))} · ${pesos(c.importe)}`;
  }

  /**
   * La única fila de configuración. Se crea con los textos por defecto la primera vez,
   * desde acá y no desde la migración: así los acentos los maneja el cliente de Prisma,
   * que sí trabaja en UTF-8.
   */
  private async fila(): Promise<ConfigFila> {
    return this.prisma.configuracionAvisos.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        asuntoProximo: ASUNTO_PROXIMO_POR_DEFECTO,
        cuerpoProximo: CUERPO_PROXIMO_POR_DEFECTO,
        asuntoVencida: ASUNTO_VENCIDA_POR_DEFECTO,
        cuerpoVencida: CUERPO_VENCIDA_POR_DEFECTO,
      },
    });
  }

  private aConfigDTO(fila: ConfigFila): ConfiguracionAvisosCompleta {
    return {
      activo: fila.activo,
      diasAntes: fila.diasAntes,
      diasDespues: fila.diasDespues,
      horaEnvio: fila.horaEnvio,
      remitenteNombre: fila.remitenteNombre,
      copiaOculta: fila.copiaOculta,
      asuntoProximo: fila.asuntoProximo,
      cuerpoProximo: fila.cuerpoProximo,
      asuntoVencida: fila.asuntoVencida,
      cuerpoVencida: fila.cuerpoVencida,
      remitenteEmail: this.correo.remitente,
      smtpConfigurado: this.correo.configurado,
      smtp: this.correo.descripcion,
    };
  }
}

/** Suma días a una fecha 'AAAA-MM-DD'. Negativo resta. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El mensaje del servidor SMTP, recortado para que entre en la tabla del historial. */
function mensajeDeError(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}
