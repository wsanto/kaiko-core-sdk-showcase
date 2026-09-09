import type { VineValidator as VineLibValidator } from '@vinejs/vine'
import { SchemaTypes } from '@vinejs/vine/types'
import { snakeToCamelObject } from './case-converter';

export async function VineParseStringify<S extends SchemaTypes, M extends Record<string, any> | undefined>(
    data: string,
    schema: VineLibValidator<S, M>
) {
    const body = JSON.parse(data);
    const denormalizeBody = snakeToCamelObject(body);
    const validatedBody = await schema.validate(denormalizeBody, undefined as any);

    return validatedBody;
}