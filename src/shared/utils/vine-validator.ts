import { validator } from 'hono/validator'
import type { VineValidator as VineLibValidator } from '@vinejs/vine'
import { SchemaTypes } from '@vinejs/vine/types'
import { snakeToCamelObject } from './case-converter'
import { Response } from './response'

export function VineValidator<S extends SchemaTypes, M extends Record<string, any> | undefined>(
    target: Parameters<typeof validator>[0],
    schema: VineLibValidator<S, M>
) {
    return validator(target, async (value: any, c) => {
        try {
            const result = await schema.validate(value, undefined as any)
            return snakeToCamelObject(result)
        } catch (err: any) {
            return Response.error(c, {
                message: 'Validation error',
                code: err.status || 400,
                details: err.messages,
            })
        }
    })
}