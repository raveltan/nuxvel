export interface Route {
  method: string;
  path: string;
  source: string;
}

export function sortRoutes<T extends Route>(routes: T[]): T[] {
  return [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}
