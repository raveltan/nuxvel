const cachedHandler = defineCachedEventHandler(
  (event) => {
    if (getQuery(event).fail) throw new Error(`cached handler exploded ${getQuery(event).key}`);

    return { ok: true };
  },
  {
    getKey: (event) => String(getQuery(event).key),
    shouldInvalidateCache: (event) => Boolean(getQuery(event).fail),
  },
);

const cachedFunction = defineCachedFunction(
  (key: string, fail: boolean) => {
    if (fail) throw new Error(`cached function exploded ${key}`);

    return { ok: true };
  },
  { getKey: (key: string) => key, shouldInvalidateCache: (_key: string, fail: boolean) => fail },
);

export default defineEventHandler((event) => {
  const { key, fail, eventless } = getQuery(event);

  return eventless ? cachedFunction(String(key), Boolean(fail)) : cachedHandler(event);
});
