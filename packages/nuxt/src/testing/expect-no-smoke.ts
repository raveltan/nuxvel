import { expectAccessible, type ExpectAccessibleOptions } from "./expect-accessible";
import type { RouteLocationRaw } from "vue-router";
import { openPage } from "./visit";

/**
 * Opens each page of the app and fails if one or more pages have a problem.
 *
 * It reads the page routes from the router in the browser. It opens each
 * route that has no params. It does not open a route that is not a page,
 * such as a redirect of a route rule (`/sitemap.xml`). It does not open a route with params. Give
 * concrete paths for them in `extraPaths`. A page has a problem when
 * `visit` records an error on it, when its status is 400 or more, or when
 * {@link expectAccessible} finds a violation. The error lists each page and
 * each problem. Call it only in a test.
 *
 * @param extraPaths - More pages to open, as paths or route locations, for example `/posts/1` or `{ name: "posts-id", params: { id: 1 } }`.
 * @param options - The {@link ExpectAccessibleOptions} for each page.
 *
 * @example
 * ```ts
 * it("opens each page without errors", async () => {
 *   const post = await postFactory();
 *
 *   await expectNoSmoke([`/posts/${post.id}`]);
 * }, 60_000);
 * ```
 */
export async function expectNoSmoke(extraPaths: (string | RouteLocationRaw)[] = [], options: ExpectAccessibleOptions = {}) {
  const { page } = await openPage("/");
  const routes = await page.evaluate(() => {
    // runs in the browser, but this file is also typechecked in programs without the DOM lib
    const { useNuxtApp } = globalThis as {
      useNuxtApp?: () => { $router: { getRoutes: () => { path: string; redirect?: unknown; components?: Record<string, object> | null }[] } };
    };
    // nuxt adds a route with an empty stub component for each route rule redirect, such as the /sitemap.xml of @nuxtjs/sitemap
    const isPage = (route: { redirect?: unknown; components?: Record<string, object> | null }) =>
      !route.redirect && Object.values(route.components ?? {}).some((component) => typeof component === "function" || Object.keys(component).length > 0);
    return useNuxtApp?.().$router.getRoutes().filter(isPage).map((route) => route.path) ?? [];
  });
  await page.close();

  const failures: string[] = [];
  for (const path of [...routes.filter((route) => !route.includes(":")), ...extraPaths]) {
    const { page, errors } = await openPage(path);
    await expectAccessible(page, options).catch((error: Error) => errors.push(error.message));
    await page.close();
    if (errors.length > 0) failures.push(`${typeof path === "string" ? path : JSON.stringify(path)}\n  ${errors.join("\n  ")}`);
  }

  if (failures.length > 0) throw new Error(`expectNoSmoke: ${failures.length} page(s) failed\n\n${failures.join("\n\n")}`);
}
