import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Devuelve siempre `{ statusCode, message, field? }` para que la web muestre el error tal cual. */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { statusCode: status, ...(body as object) };
      res.status(status).json(payload);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      res.status(404).json({ statusCode: 404, message: 'No se encontró el registro' });
      return;
    }

    this.logger.error(exception);
    res.status(500).json({ statusCode: 500, message: 'Ocurrió un error inesperado. Intentá de nuevo.' });
  }
}
