import type { Page } from "playwright/test";
import { type Mock, vi } from "vitest";
import { trpcCalls } from "../runtime/shared/trpc/trpc-calls";
import { TRPC_PATH } from "../runtime/shared/trpc/trpc-path";
import type { TrpcPath, TrpcProcedure } from "../trpc-procedure";

export const trpcSpyPath = Symbol("trpcSpyPath");

export const spiedPages = new WeakMap<object, Page>();

/**
 * A `vi.fn()` from {@link trpcSpy}: it records the input of each call
 * that the page makes to the tRPC procedure at `P`.
 */
export type TrpcSpy<P extends TrpcPath> = Mock<(...input: Parameters<TrpcProcedure<P>>) => void> & { readonly [trpcSpyPath]: P };

/**
 * Returns a `vi.fn()` that records the calls of `page` to the tRPC
 * procedure at `path`, typed by the app router and named after the path.
 * It is the end-to-end version of the component `trpcSpy` of
 * `@nuxvel/nuxt/storybook/mocks`.
 *
 * `page` is a page from {@link visit} or `actingAs(user).visit()`. The spy
 * reads each request of the browser to `/api/trpc`: a query, a mutation,
 * batched or not. Each call gets the input of the procedure, as the
 * procedure gets it. The real server answers, and the spy does not change
 * the answer. To give a fake answer, write a component test with
 * `mockTrpc`. The spy records only the calls after `trpcSpy`, so it does
 * not record the calls of the server rendering. `expect(spy)` of
 * {@link expect} checks the calls, and it tries again until the browser
 * timeout ends. On a page with the `clock: true` option of `visit`, each
 * try moves the paused browser clock 1 ms, so a call that the tRPC client
 * sends in a timer arrives. A wrong path, or a `toHaveBeenCalledWith` argument with a
 * wrong type, does not compile.
 *
 * @param path The dotted path of the procedure, such as `"post.list"`.
 *
 * @example
 * ```ts
 * import { expect, field, trpcSpy, visit } from "@nuxvel/nuxt/testing";
 *
 * const page = await visit("/posts");
 * const list = trpcSpy(page, "post.list");
 *
 * await field(page, "Search").pressSequentially("hello", { delay: 50 });
 * await expect(list).toHaveBeenCalledWith({ q: "hello" });
 * await expect(list).toHaveBeenCalledTimes(1);
 * ```
 */
export function trpcSpy<P extends TrpcPath>(page: Page, path: P): TrpcSpy<P> {
  const spy = Object.assign(vi.fn<(...input: Parameters<TrpcProcedure<P>>) => void>().mockName(path), { [trpcSpyPath]: path });

  spiedPages.set(spy, page);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith(`${TRPC_PATH}/`)) return;
    for (const call of trpcCalls(url, request.method() === "GET" ? null : request.postData())) {
      if (call.path === path) Reflect.apply(spy, undefined, [call.input]);
    }
  });

  return spy;
}
