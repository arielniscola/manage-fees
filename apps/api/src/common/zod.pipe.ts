import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, output } from 'zod';

/** Valida y transforma body o query con un esquema compartido de @mf/shared. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const errors = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new BadRequestException({
      statusCode: 400,
      message: errors[0]?.message ?? 'Datos inválidos',
      field: errors[0]?.path || undefined,
      errors,
    });
  }
}
