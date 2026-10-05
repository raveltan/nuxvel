import type { NuxtHooks, NuxtPage } from "@nuxt/schema";
import { defu } from "defu";
import { createRouter, toRouteMatcher } from "radix3";
import { PRIVATE_ROUTE_RULE } from "./rendering";

export type RouteRules = Parameters<NuxtHooks["nitro:init"]>[0]["options"]["routeRules"];
type RouteRule = RouteRules[string];

const NEVER_CACHED: RouteRule = {
  isr: false,
  cache: false,
  prerender: false,
  ...PRIVATE_ROUTE_RULE,
};

export function routePattern(path: string) {
  const open = path.search(/\/[^/]*:\w+(\([^)]*\))?[?*+]/);
  const fixed = open === -1 ? path : `${path.slice(0, open)}/**`;

  return fixed.replace(/\([^)]*\)/g, "").replace(/:([^/*]*)/g, (_, name: string) => `:${name.replace(/\W/g, "")}`);
}

export function joinPath(parent: string, path: string) {
  if (path.startsWith("/")) return path;
  if (path === "") return parent;

  return `${parent.replace(/\/$/, "")}/${path}`;
}

function usesAuthMiddleware(page: NuxtPage) {
  return [page.meta?.middleware].flat().includes("auth");
}

export function authedPatterns(pages: NuxtPage[], parent = "/", inherited = false): string[] {
  return pages.flatMap((page) => {
    const path = joinPath(parent, page.path);
    const authed = inherited || usesAuthMiddleware(page);
    const paths = [path, ...[page.alias ?? []].flat().map((alias) => joinPath(parent, alias))];

    return [
      ...(authed ? paths.map(routePattern) : []),
      ...authedPatterns(page.children ?? [], path, authed),
    ];
  });
}

function isCacheable(rules: RouteRule) {
  return Boolean(rules.cache || rules.isr || rules.prerender);
}

/**
 * Forces every page behind the `auth` middleware off any cached route rule,
 * onto the `private` rendering preset, and returns the patterns it
 * overrode.
 */
export function guardPrivatePages(pages: NuxtPage[], routeRules: RouteRules) {
  const matcher = toRouteMatcher(createRouter({ routes: routeRules }));
  const overridden: string[] = [];

  for (const pattern of new Set(authedPatterns(pages))) {
    const rules: RouteRule = defu({}, ...matcher.matchAll(pattern).reverse());

    if (!isCacheable(rules)) continue;

    routeRules[pattern] = defu(NEVER_CACHED, routeRules[pattern]);
    overridden.push(pattern);
  }

  return overridden;
}
