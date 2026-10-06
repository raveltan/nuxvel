import { addRouteMiddleware } from "@nuxt/kit";
import type { Nuxt, NuxtPage } from "@nuxt/schema";
import type { RuntimeFile } from "./resolved-options";

/** The page meta a route group gives each page under `pages/(<group>)/`. */
export interface PageGroupMeta {
  /** The named route middleware the page runs, such as `"auth"`. */
  middleware?: string | string[];
  /** The layout the page renders in, or `false` for none. */
  layout?: string | false;
}

function applyGroups(pages: NuxtPage[], groups: Record<string, PageGroupMeta>) {
  for (const page of pages) {
    const pageGroups: PageGroupMeta[] = (page.meta?.groups ?? []).flatMap((group: string) => groups[group] ?? []);
    if (pageGroups.length > 0) {
      const meta: Record<string, unknown> = { ...page.meta };
      for (const group of [...pageGroups].reverse()) {
        for (const [key, value] of Object.entries(group)) if (key !== "middleware") meta[key] ??= value;
      }
      meta.groupMiddleware = [...new Set(pageGroups.flatMap((group) => group.middleware ?? []))];
      page.meta = meta;
    }
    applyGroups(page.children ?? [], groups);
  }
}

export function setupPageGroups(nuxt: Nuxt, groups: Record<string, PageGroupMeta>, runtimeFile: RuntimeFile) {
  // the group's middleware runs from a global middleware, so the page's own middleware, inline functions included, stays untouched
  addRouteMiddleware({ name: "nuxvel-page-groups", path: runtimeFile("./runtime/app/middleware/page-groups"), global: true });
  // definePageMeta's layout must reach the route record at build time, where it can win over the group's
  if (!nuxt.options.experimental.extraPageMetaExtractionKeys.includes("layout")) {
    nuxt.options.experimental.extraPageMetaExtractionKeys.push("layout");
  }
  nuxt.hook("pages:resolved", (pages) => applyGroups(pages, groups));
}
