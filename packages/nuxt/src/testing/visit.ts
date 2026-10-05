import { basename, join } from "node:path";
import { createPage, url, waitForHydration } from "@nuxt/test-utils/e2e";
import type { Response } from "playwright/test";
import { afterEach, onTestFinished } from "vitest";
import type { RouteLocationRaw } from "vue-router";
import { browserTimeout } from "./expect";
import { pausedClocks } from "./paused-clocks";
import { addSessionCookie, type Session } from "./session";

/**
 * Options for {@link visit}: Playwright browser context options, for example a device or `colorScheme`, `status` and `clock`.
 *
 * @param clock - With `true`, `visit` installs the Playwright clock and pauses it before the page loads. Then a timer of the browser runs only when the test calls `page.clock.runFor(ms)`, so a debounce needs no real wait. While `expect(spy)` of a {@link trpcSpy} waits for a call, it moves the clock 1 ms at each try. Thus the tRPC client sends the call that a timer starts, and the test does not call `page.clock.resume()`. It controls only the browser: `freezeTime()` and `travelTo()` still control the clock of the server.
 * @param status - The status that the page response must have, for example `404` for a page that does not exist. `visit` fails the test when the status differs, and it does not record a response with this status as an error.
 * @param locale - A locale code of the app, for example `"zh"`. `visit` opens the localized path of `target`, for example `/zh/posts` for `/posts`, and the browser gets this locale, as with the Playwright `locale` option.
 * @param allowFailedRequests - The requests that the test aborts on purpose, for example with `page.route(url, (route) => route.abort())`. Each item is a glob that matches the whole URL, as in `page.route`, or a `RegExp`. `visit` does not record a failed request that matches an item. It still records each other error.
 */
export type VisitOptions = NonNullable<Parameters<typeof createPage>[1]> & {
  status?: number;
  clock?: boolean;
  allowFailedRequests?: (string | RegExp)[];
};

type VisitTarget = string | RouteLocationRaw;

type VisitPage = Awaited<ReturnType<typeof createPage>>;

function fileName(name: string) {
  return name.replace(/[^\w.-]+/g, "-");
}

const visited: { page: VisitPage; errors: string[] }[] = [];

afterEach(async ({ task }) => {
  for (const { page, errors } of visited.splice(0)) {
    page.removeAllListeners();
    if (task.result?.state === "fail" || errors.length > 0) {
      await page.screenshot({ path: join("test-results", basename(task.file.name), `${fileName(task.name)}.png`), fullPage: true });
    }
    await page.close();
  }
});

/**
 * Opens `target` in a new Playwright page and waits for hydration.
 *
 * `target` is a path, a full URL or a route location. A full URL, such as
 * a link from a mail, opens its path, query and hash on the app under
 * test. A route location, such as `{ name: "posts-id", params: { id } }`,
 * is typed from `experimental.typedPages`, so a renamed page fails the
 * typecheck. `visit` resolves it with the router of the app, in one
 * more page load.
 *
 * The page gets its own browser context with the Playwright context
 * options, for example a device or `colorScheme`. It opens signed out:
 * to open it as a user, call `actingAs(user).visit(path)`. A page with `noScripts`, such as
 * `/offline`, does not hydrate. `visit` does not wait for hydration on
 * that page. Each action and navigation on the page times out after
 * `nuxvelBrowserTimeout` of the Vitest config, 5 seconds by default. A
 * `timeout` option on one call overrides it.
 *
 * `visit` records page errors, `console.error` messages, failed requests
 * (except those that match `allowFailedRequests`, and an event stream such as
 * `/api/channels` that the page closes or leaves while it connects) and responses with a status of 500 or more. It also records the page
 * response when its status is 400 or more. With the `status` option,
 * `visit` records an error when the page response has another status,
 * and it does not record the page response as an error when it has that
 * status. It is the way to open a 404 page. It also records the error
 * page (`error.vue`) when the page shows it with a status of 500 or more
 * after hydration. At the end of the test,
 * it fails the test with each recorded error. When the test fails, it
 * saves a full-page screenshot to `test-results/<file>/<test>.png`. It
 * closes the page when the test ends, before the setup empties the
 * tables, so a page of one test sends no requests during the next.
 * Call it only in a test. The first `visit()` of a test file starts the
 * browser.
 *
 * @param target - The path, full URL or route location to open, for example `/posts` or `{ name: "posts" }`.
 * @param options - See {@link VisitOptions}.
 *
 * @example
 * ```ts
 * import { devices } from "playwright/test";
 *
 * const page = await visit("/posts", { ...devices["iPhone 13"], colorScheme: "dark" });
 * await expectAccessible(page);
 *
 * await visit({ name: "posts-id", params: { id: post.id } });
 * await visit("/no-such-page", { status: 404 });
 * await visit("/posts", { allowFailedRequests: [/post\.list/] });
 *
 * const search = await visit("/posts", { clock: true });
 * await field(search, "Search").pressSequentially("hello");
 * await search.clock.runFor(300);
 *
 * const { url } = await expectMailSent("password-reset", { to: user.email });
 * await visit(url);
 * ```
 */
export function visit(target: VisitTarget, options: VisitOptions = {}): Promise<VisitPage> {
  return recordedVisit(target, options, undefined);
}

export async function recordedVisit(target: VisitTarget, options: VisitOptions, session: Session | undefined): Promise<VisitPage> {
  const { page, errors } = await openPage(target, options, session);
  const path = typeof target === "string" ? target : JSON.stringify(target);

  visited.push({ page, errors });
  onTestFinished(() => {
    if (errors.length > 0) throw new Error(`visit("${path}") recorded ${errors.length} error(s):\n${errors.join("\n")}`);
  });

  return page;
}

function globToRegExp(glob: string) {
  let braces = 0;
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob.charAt(i);
    if (char === "*") {
      const double = glob.charAt(i + 1) === "*";
      if (double) i++;
      source += double ? ".*" : "[^/]*";
    } else if (char === "?") source += ".";
    else if (char === "{") {
      braces++;
      source += "(?:";
    } else if (char === "}" && braces > 0) {
      braces--;
      source += ")";
    } else if (char === "," && braces > 0) source += "|";
    else source += char.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function appPath(path: string) {
  const { pathname, search, hash } = new URL(path, "http://app");

  return pathname + search + hash;
}

async function resolveRoute(target: VisitTarget, locale?: string) {
  const page = await createPage("/");
  try {
    await waitForHydration(page, url("/"), "hydration");
    const resolved = await page.evaluate(({ location, locale }) => {
      // runs in the browser, but this file is also typechecked in programs without the DOM lib
      const { useNuxtApp } = globalThis as {
        useNuxtApp?: () => {
          $router: { hasRoute: (name: string) => boolean; resolve: (location: unknown) => { fullPath: string } };
          $localePath: (to: unknown, locale: string) => string;
        };
      };
      const nuxtApp = useNuxtApp?.();
      const name = typeof location === "string" ? undefined : (location as { name?: unknown }).name;
      if (nuxtApp && typeof name === "string" && !nuxtApp.$router.hasRoute(name)) return { missing: name };
      if (nuxtApp && locale) return { path: nuxtApp.$localePath(location, locale) };
      return { path: nuxtApp?.$router.resolve(location).fullPath ?? "/" };
    }, { location: target, locale });
    if ("missing" in resolved) throw new Error(`visit: no page has the route name "${resolved.missing}"`);
    return resolved.path;
  } finally {
    await page.close();
  }
}

export async function openPage(target: VisitTarget, { status: expectedStatus, clock, allowFailedRequests = [], ...contextOptions }: VisitOptions = {}, session?: Session) {
  const path = appPath(typeof target === "string" && !contextOptions.locale ? target : await resolveRoute(typeof target === "string" ? appPath(target) : target, contextOptions.locale));
  const page = await createPage(undefined, contextOptions);
  page.context().setDefaultTimeout(browserTimeout);
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(`console.error: ${message.text()}`);
  });
  const responseErrors = new Map<Response, string>();
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const error = `HTTP ${response.status()}: ${response.url()}`;
    responseErrors.set(response, error);
    errors.push(error);
  });
  const allowed = allowFailedRequests.map((pattern) => (typeof pattern === "string" ? globToRegExp(pattern) : pattern));
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "eventsource" && request.failure()?.errorText === "net::ERR_ABORTED") return;
    if (allowed.some((pattern) => pattern.test(request.url()))) return;
    errors.push(`failed request: ${request.url()} (${request.failure()?.errorText})`);
  });

  if (session) await addSessionCookie(page, session);
  if (clock) {
    await page.clock.install();
    await page.clock.pauseAt(Date.now());
    pausedClocks.add(page);
  }

  const response = await page.goto(url(path));
  const status = response?.status() ?? 0;
  if (expectedStatus === undefined) {
    if (status >= 400 && status < 500) errors.unshift(`HTTP ${status}: ${response?.url()}`);
  } else if (status === expectedStatus) {
    const recorded = response && responseErrors.get(response);
    if (recorded) errors.splice(errors.indexOf(recorded), 1);
  } else {
    errors.unshift(`expected HTTP ${expectedStatus}, got ${status}: ${response?.url()}`);
  }
  if (await page.locator('script[type="module"]').count()) {
    await waitForHydration(page, url(path), "hydration");
    const error = await page.evaluate(() => {
      // runs in the browser, but this file is also typechecked in programs without the DOM lib
      const { useNuxtApp } = globalThis as { useNuxtApp?: () => { payload: { error?: { statusCode: number; message: string } | null } } };
      const error = useNuxtApp?.().payload.error;
      return error && { statusCode: error.statusCode, message: error.message };
    });
    if (error && error.statusCode >= 500) errors.push(`error page: ${error.statusCode} ${error.message}`);
  }

  return { page, errors };
}
