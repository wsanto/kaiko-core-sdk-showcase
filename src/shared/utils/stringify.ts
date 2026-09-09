import { camelToSnakeObject } from './case-converter';

export function Stringify<T extends Record<string, any>>(
    data: T
): string {
    const body = JSON.stringify(camelToSnakeObject(data))

    return body;
}