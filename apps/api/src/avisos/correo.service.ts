import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  copiaOculta?: string | null;
  remitenteNombre?: string | null;
}

/**
 * Envío por SMTP. La configuración del servidor vive en el entorno, no en la base: es
 * cosa del despliegue, y las contraseñas no tienen por qué pasar por la pantalla.
 *
 * `SMTP_HOST=json` no manda nada y deja el correo en el log. Sirve para desarrollo y para
 * probar el circuito completo antes de tener casilla real.
 */
@Injectable()
export class CorreoService {
  private readonly log = new Logger('Correo');
  private transporte: Transporter | null = null;

  private readonly host = process.env.SMTP_HOST ?? '';
  private readonly puerto = Number(process.env.SMTP_PORT ?? 587);
  private readonly usuario = process.env.SMTP_USER ?? '';
  private readonly clave = process.env.SMTP_PASS ?? '';
  private readonly seguro = process.env.SMTP_SECURE === 'true';
  readonly remitente = process.env.SMTP_FROM || this.usuario || null;

  /** Modo desarrollo: arma el correo pero no lo manda. */
  private get simulado(): boolean {
    return this.host.toLowerCase() === 'json';
  }

  get configurado(): boolean {
    return this.host !== '';
  }

  /** Texto para mostrar en la pantalla de configuración. */
  get descripcion(): string | null {
    if (!this.configurado) return null;
    if (this.simulado) return 'Modo de prueba: los correos se registran pero no se envían';
    return `${this.host}:${this.puerto}${this.seguro ? ' (SSL)' : ''}`;
  }

  async enviar(correo: Correo): Promise<void> {
    if (!this.configurado) {
      throw new Error('El servidor no tiene SMTP configurado (falta SMTP_HOST)');
    }

    const de = correo.remitenteNombre && this.remitente ? `"${correo.remitenteNombre}" <${this.remitente}>` : this.remitente;
    const mensaje = {
      from: de ?? undefined,
      to: correo.para,
      bcc: correo.copiaOculta ?? undefined,
      subject: correo.asunto,
      text: correo.texto,
      html: this.aHtml(correo.texto),
    };

    if (this.simulado) {
      this.log.log(`[simulado] Para ${correo.para}: ${correo.asunto}`);
      return;
    }
    await this.obtenerTransporte().sendMail(mensaje);
  }

  /** Comprueba que el servidor SMTP responda y acepte las credenciales. */
  async verificar(): Promise<void> {
    if (!this.configurado) throw new Error('El servidor no tiene SMTP configurado (falta SMTP_HOST)');
    if (this.simulado) return;
    await this.obtenerTransporte().verify();
  }

  private obtenerTransporte(): Transporter {
    this.transporte ??= createTransport({
      host: this.host,
      port: this.puerto,
      secure: this.seguro,
      ...(this.usuario && { auth: { user: this.usuario, pass: this.clave } }),
    });
    return this.transporte;
  }

  /** El cuerpo se escribe en texto plano; la versión HTML es el mismo texto, legible. */
  private aHtml(texto: string): string {
    const escapado = texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#22251F">${escapado}</div>`;
  }
}
