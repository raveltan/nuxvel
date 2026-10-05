import type { NuxtOptions } from "@nuxt/schema";

type RouteRule = NonNullable<NuxtOptions["routeRules"]>[string];

/**
 * A named way of rendering a route, set per route pattern under
 * `nuxvel.rendering`.
 *
 * - `cached`: server-rendered once, served from Nitro's cache and
 *   re-rendered in the background after 60 seconds (stale-while-
 *   revalidate; on Node this is also what ISR means). For public pages only.
 * - `private`: server-rendered on every request with
 *   `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, for
 *   pages that show one user's data.
 * - `client`: never rendered on the server; the browser renders the page
 *   from an empty shell.
 *
 * Routes without a preset are server-rendered on every request.
 */
export type RenderingPreset = "cached" | "private" | "client";

export const PRIVATE_ROUTE_RULE = {
  headers: {
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex",
  },
} satisfies RouteRule;

const PRESET_ROUTE_RULES: Record<RenderingPreset, RouteRule> = {
  cached: { cache: { swr: true, maxAge: 60 } },
  private: PRIVATE_ROUTE_RULE,
  client: { ssr: false },
};

/** The `routeRules` each route pattern's rendering preset stands for. */
export function renderingRouteRules(rendering: Record<string, RenderingPreset>) {
  return Object.fromEntries(
    Object.entries(rendering).map(([pattern, preset]) => [
      pattern,
      PRESET_ROUTE_RULES[preset],
    ]),
  );
}
