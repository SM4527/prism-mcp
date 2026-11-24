const DOLLAR_KEY = /(Cents|Usd|usd)$/;

/** Drop every key ending in Cents, Usd or usd, at any depth. */
export function dropDollarKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropDollarKeys) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DOLLAR_KEY.test(key))
      .map(([key, child]) => [key, dropDollarKeys(child)]),
  ) as T;
}
