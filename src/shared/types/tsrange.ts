import { customType } from 'drizzle-orm/pg-core';
import {
  Range as PgRange,
  parse as rangeParse,
  serialize as rangeSerialize,
} from 'postgres-range';

// Bounds constants from postgres-range: RANGE_LB_INC = 2 (include lower), RANGE_UB_INC = 4 (include upper)
const RANGE_LB_INC = 2; // [) - include lower bound

export const createTsRange = (start: Date, end: Date): PgRange<Date> => {
  const range = new PgRange(start, end, RANGE_LB_INC);
  return range;
};

export const customTSRange = customType<{
  data: PgRange<Date> | null;
  driverData: string | null;
  config: never;
}>({
  dataType() {
    return 'tsrange';
  },

  toDriver(value: PgRange<Date> | null): string | null {
    if (value == null) return null;
    const pgRange = rangeSerialize(value, (date: Date) => {
      if (!(date instanceof Date)) return String(date);
      return date.toISOString().replace('T', ' ').replace('Z', '');
    });

    return pgRange;
  },

  fromDriver(value: string | null): PgRange<Date> | null {
    if (value == null) return null;
    const parsed = rangeParse<Date>(value, (value: string) => {
      return new Date(value + 'Z')
    });

    return parsed;
  },
});