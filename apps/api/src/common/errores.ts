import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

export const noEncontrado = (message: string) => new NotFoundException({ statusCode: 404, message });

export const conflicto = (message: string, field?: string) =>
  new ConflictException({ statusCode: 409, message, field });

export const reglaIncumplida = (message: string, field?: string) =>
  new UnprocessableEntityException({ statusCode: 422, message, field });
