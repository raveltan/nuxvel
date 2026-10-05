import type { NuxtPage } from "@nuxt/schema";
import { joinPath, routePattern } from "./private-page-guard";
import { RESERVED_PREFIXES } from "./reserved-prefixes";

function flatPages(pages: NuxtPage[], parent = "/"): { path: string; file?: string }[] {
  return pages.flatMap((page) => {
    const path = joinPath(parent, page.path);

    return [{ path, file: page.file }, ...flatPages(page.children ?? [], path)];
  });
}

function shape(pattern: string) {
  return pattern.replace(/\*\*(:\w+)?|:\w+/g, "*");
}

export function reservedPathErrors(pages: NuxtPage[], serverRoutes: { route?: string; handler: string }[]) {
  const errors: string[] = [];

  for (const page of flatPages(pages)) {
    const prefix = RESERVED_PREFIXES.find((reserved) => page.path === reserved || page.path.startsWith(`${reserved}/`));

    if (prefix) errors.push(`nuxvel: ${page.file} is the page ${page.path}, under ${prefix}, which is reserved for the server; move the page`);

    const pageShape = shape(routePattern(page.path));
    const route = serverRoutes.find((candidate) => candidate.route && shape(candidate.route) === pageShape);

    if (route) errors.push(`nuxvel: ${route.handler} serves ${route.route}, the path of the page ${page.file}; rename one of them`);
  }

  return errors;
}
