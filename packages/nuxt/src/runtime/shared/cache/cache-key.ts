/**
 * A cache key: a string, used as it is, or an array of parts.
 *
 * A string part stays as it is; any other part is written as JSON with
 * its object keys sorted, so `{ page, q }` and `{ q, page }` are the same
 * key. The parts are joined with `:`, so `["posts", "list", { page: 1 }]`
 * is the key `posts:list:{"page":1}`.
 */
export type CacheKey = string | readonly unknown[];

function sortedKeys(_key: string, value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;

  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function partOf(part: unknown) {
  if (typeof part === "string") return part;

  return JSON.stringify(part, sortedKeys) ?? "null";
}

export function cacheKeyString(key: CacheKey) {
  return typeof key === "string" ? key : key.map(partOf).join(":");
}

export function escapeGlob(key: string) {
  return key.replace(/[*?[\]\\]/g, "\\$&");
}
