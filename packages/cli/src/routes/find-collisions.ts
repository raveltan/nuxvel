import type { Route } from "./route.ts";

function normalizedPath(path: string) {
  return path.replace(/\*\*:[^/]+/g, "**").replace(/:[^/]+/g, ":param");
}

function methodsOverlap(a: string, b: string) {
  return a === b || a === "ALL" || b === "ALL";
}

export function findCollisions(routes: Route[]) {
  const byPath = new Map<string, Route[]>();

  for (const route of routes) {
    const key = normalizedPath(route.path);
    byPath.set(key, [...(byPath.get(key) ?? []), route]);
  }

  return [...byPath.entries()].flatMap(([path, group]) => {
    const colliding = group.filter((route) =>
      group.some((other) => other !== route && methodsOverlap(route.method, other.method)),
    );

    if (colliding.length === 0) return [];

    const method = [...new Set(colliding.map((route) => route.method))].sort().join("|");

    return [{ method, path, sources: colliding.map((route) => route.source) }];
  });
}
