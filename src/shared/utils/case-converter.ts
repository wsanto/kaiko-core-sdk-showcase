export type SnakeToCamelObject<T> = T extends Array<infer U>
  ? Array<SnakeToCamelObject<U>>
  : T extends object
  ? {
    [K in keyof T as K extends string ? CamelCase<K> : K]: SnakeToCamelObject<T[K]>
  }
  : T;

export type CamelToSnakeObject<T> = T extends Array<infer U>
  ? Array<CamelToSnakeObject<U>>
  : T extends object
  ? {
    [K in keyof T as K extends string ? SnakeCase<K> : K]: CamelToSnakeObject<T[K]>
  }
  : T;

// Usage in functions:
export function snakeToCamelObject<T>(obj: T): SnakeToCamelObject<T> {
  if (Array.isArray(obj)) {
    return obj.map(item => snakeToCamelObject(item)) as SnakeToCamelObject<T>;
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[camelKey] = snakeToCamelObject(value);
      } else if (Array.isArray(value)) {
        result[camelKey] = value.map(item =>
          item && typeof item === 'object' ? snakeToCamelObject(item) : item
        );
      } else {
        result[camelKey] = value;
      }
    }
    return result;
  }

  return obj as SnakeToCamelObject<T>;
}

export function camelToSnakeObject<T>(obj: T): CamelToSnakeObject<T> {
  if (Array.isArray(obj)) {
    return obj.map(item => camelToSnakeObject(item)) as CamelToSnakeObject<T>;
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      const value = obj[key];
      if ((value as any) instanceof Date) {
        result[snakeKey] = value
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[snakeKey] = camelToSnakeObject(value);
      } else if (Array.isArray(value)) {
        result[snakeKey] = value.map(item =>
          item && typeof item === 'object' ? camelToSnakeObject(item) : item
        );
      } else {
        result[snakeKey] = value;
      }
    }
    return result;
  }

  return obj as CamelToSnakeObject<T>;
}

// Helper types
type CamelCase<S extends string> =
  S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type SnakeCase<S extends string> =
  S extends `${infer First}${infer Rest}`
  ? First extends Lowercase<First>
  ? `${First}${SnakeCase<Rest>}`
  : `_${Lowercase<First>}${SnakeCase<Rest>}`
  : S;