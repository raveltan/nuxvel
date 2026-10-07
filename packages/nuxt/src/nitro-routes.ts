/**
 * Builds `#nuxvel/nitro-routes`: every Nitro route with its method and
 * handler file, sorted by path. Two handlers claiming one method and path
 * are both kept, so `nuxvel route:list` can report the collision.
 */
export function buildNitroRoutesModuleCode(
  handlers: { route?: string; method?: string; middleware?: boolean; handler: string }[],
) {
  const unique = new Map<string, { method: string; route: string; handler: string }>();

  for (const handler of handlers) {
    if (!handler.route || handler.middleware) continue;

    const method = handler.method?.toUpperCase() ?? "ALL";
    unique.set(`${method} ${handler.route} ${handler.handler}`, {
      method,
      route: handler.route,
      handler: handler.handler,
    });
  }

  const routes = [...unique.values()].sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method),
  );

  return `export default ${JSON.stringify(routes)};\n`;
}
