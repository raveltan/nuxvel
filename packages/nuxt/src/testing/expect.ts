import { type ExpectMatcherState, type Locator, type Page, expect as playwrightExpect } from "playwright/test";
import { type Assertion, type ExpectStatic, inject, expect as vitestExpect } from "vitest";
import type { TrpcPath, TrpcProcedure } from "../trpc-procedure";
import { playwrightDebug } from "./debug";
import { pausedClocks } from "./paused-clocks";
import { spiedPages, type TrpcSpy, trpcSpyPath } from "./trpc-spy";
import "./matchers";

declare module "vitest" {
  interface ProvidedContext {
    /**
     * The timeout in milliseconds of each browser action, navigation and
     * {@link expect} assertion in the end-to-end tests. Defaults to 5000.
     * Set it in `test.provide` of the Vitest config. A `timeout` option on
     * one call still overrides it. When `PWDEBUG=1` is set, there is no
     * timeout.
     *
     * @example
     * ```ts
     * export default defineConfig({
     *   test: { provide: { nuxvelBrowserTimeout: 10_000 } },
     * });
     * ```
     */
    nuxvelBrowserTimeout: number;
  }
}

export const browserTimeout = playwrightDebug ? 0 : (inject("nuxvelBrowserTimeout") ?? 5000);

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function edges(box: Box) {
  const round = (value: number) => Math.round(value * 10) / 10;
  return `top ${round(box.y)}, bottom ${round(box.y + box.height)}, left ${round(box.x)}, right ${round(box.x + box.width)}`;
}

function layoutMatcher(name: string, expectation: string, holds: (box: Box, other: Box) => boolean) {
  return async function (this: ExpectMatcherState, locator: Locator, other: Locator, options: { timeout?: number } = {}) {
    const timeout = options.timeout ?? this.timeout;
    let received = "no element found before the timeout";
    const relation = async () => {
      try {
        const [box, otherBox] = await Promise.all([locator.boundingBox(), other.boundingBox()]);
        if (!box || !otherBox) {
          received = `${box ? "the other element" : "the element"} is not visible`;
          return undefined;
        }
        received = `the element at (${edges(box)}) and the other element at (${edges(otherBox)})`;
        return holds(box, otherBox);
      } catch (error) {
        received = error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error);
        return undefined;
      }
    };
    const expected = !this.isNot;
    const pass = await playwrightExpect
      .poll(relation, { timeout })
      .toBe(expected)
      .then(() => expected, () => !expected);

    return {
      name,
      pass,
      message: () =>
        `${this.utils.matcherHint(name, "locator", "other", { isNot: this.isNot })}\n\n` +
        `Expected: the element ${this.isNot ? "not " : ""}${expectation}\n` +
        `Received: ${received}\n` +
        `Timeout: ${timeout}ms`,
    };
  };
}

const layoutMatchers = {
  /**
   * Checks that the element is fully above `other`: its bottom edge is at
   * or above the top edge of `other`. Retries until it is true or the
   * timeout ends, like the other web-first assertions. Fails when either
   * element is not visible. See {@link expect}.
   *
   * @param other - The element to compare with.
   * @param options - `timeout` in milliseconds. Defaults to `nuxvelBrowserTimeout`.
   *
   * @example
   * ```ts
   * await expect(heading(page, "Posts")).toBeAbove(button(page, "New post"));
   * ```
   */
  toBeAbove: layoutMatcher("toBeAbove", "above the other element", (box, other) => box.y + box.height <= other.y),
  /**
   * Checks that the element is fully below `other`: its top edge is at or
   * below the bottom edge of `other`. Works like `toBeAbove`.
   *
   * @param other - The element to compare with.
   * @param options - `timeout` in milliseconds. Defaults to `nuxvelBrowserTimeout`.
   *
   * @example
   * ```ts
   * await expect(text(page, "Copyright", { exact: false })).toBeBelow(heading(page, "Posts"));
   * ```
   */
  toBeBelow: layoutMatcher("toBeBelow", "below the other element", (box, other) => box.y >= other.y + other.height),
  /**
   * Checks that the element is fully left of `other`: its right edge is at
   * or left of the left edge of `other`. Works like `toBeAbove`.
   *
   * @param other - The element to compare with.
   * @param options - `timeout` in milliseconds. Defaults to `nuxvelBrowserTimeout`.
   *
   * @example
   * ```ts
   * await expect(button(page, "Cancel")).toBeLeftOf(button(page, "Save"));
   * ```
   */
  toBeLeftOf: layoutMatcher("toBeLeftOf", "left of the other element", (box, other) => box.x + box.width <= other.x),
  /**
   * Checks that the element is fully right of `other`: its left edge is at
   * or right of the right edge of `other`. Works like `toBeAbove`.
   *
   * @param other - The element to compare with.
   * @param options - `timeout` in milliseconds. Defaults to `nuxvelBrowserTimeout`.
   *
   * @example
   * ```ts
   * await expect(button(page, "Save")).toBeRightOf(button(page, "Cancel"));
   * ```
   */
  toBeRightOf: layoutMatcher("toBeRightOf", "right of the other element", (box, other) => box.x >= other.x + other.width),
};

const browserExpect = playwrightExpect.extend(layoutMatchers).configure({ timeout: browserTimeout });

type BrowserAssertions<T> = ReturnType<typeof browserExpect<T>>;

/**
 * The assertions of `expect(spy)` for a spy from {@link trpcSpy}. They
 * have the names and the arguments of the component `expect(spy)` of
 * `@nuxvel/nuxt/storybook/test`. Each one tries again until it passes or
 * the timeout ends: `nuxvelBrowserTimeout`, or the `timeout` of the call.
 * On a page with the `clock: true` option of `visit`, each try that fails
 * moves the paused browser clock 1 ms. The tRPC client sends a call in a
 * timer, so a call arrives without `page.clock.resume()`. Then it fails with the Vitest error, which shows the calls and the
 * diff. The arguments of `toHaveBeenCalledWith` and
 * `toHaveBeenLastCalledWith` have the input type of the procedure. See
 * {@link expect}.
 */
export interface SpyAssertions<P extends TrpcPath> {
  /** The same assertions, negated. */
  readonly not: SpyAssertions<P>;
  /** Checks that the spy has at least one call. */
  toHaveBeenCalled(options?: { timeout?: number }): Promise<void>;
  /** Checks the number of calls of the spy. */
  toHaveBeenCalledTimes(times: number, options?: { timeout?: number }): Promise<void>;
  /** Checks that one call of the spy has this input. */
  toHaveBeenCalledWith(...input: Parameters<TrpcProcedure<P>>): Promise<void>;
  /** Checks that the last call of the spy has this input. */
  toHaveBeenLastCalledWith(...input: Parameters<TrpcProcedure<P>>): Promise<void>;
}

/**
 * The `expect` of a nuxvel test: the Playwright `expect` for a `Locator`
 * or a `Page`, the {@link SpyAssertions} for a spy from `trpcSpy`, and
 * the Vitest `expect` for any other value. Import it
 * from `@nuxvel/nuxt/testing` in every kind of test.
 *
 * On a locator or a page, an assertion such as `toBeVisible`,
 * `toHaveText`, `toHaveCount` or `toHaveURL` retries until it is true or
 * the timeout ends. Then it fails with the last value it received. The
 * timeout is `nuxvelBrowserTimeout` of the Vitest config, 5 seconds by
 * default. A locator also has the layout assertions `toBeAbove`,
 * `toBeBelow`, `toBeLeftOf` and `toBeRightOf`. These need `playwright` as
 * a dev dependency.
 *
 * On any other value, it is the Vitest `expect`, with `.not`,
 * `.resolves`, `.rejects` and the nuxvel matchers, such as
 * `toBeTrpcError` and `toHaveValidationErrors`. The static members are
 * the Vitest members: `expect.any`, `expect.objectContaining` and the
 * other asymmetric matchers, `expect.poll`, `expect.assertions` and
 * `expect.soft`. `expect.soft` takes a value only. Outside the Playwright
 * runner, a failed Playwright soft assertion stops the test at once, so
 * `expect.soft` has no locator form. Use `expect(locator)`.
 *
 * @example
 * ```ts
 * import { actingAs, button, expect, guest, heading, visit } from "@nuxvel/nuxt/testing";
 *
 * await expect(guest().api.post.create({ title: "Hi" })).rejects.toBeTrpcError("UNAUTHORIZED");
 * expect(await actingAs(user).api.post.byId({ id })).toEqual({ id: expect.any(Number), title: "Hi" });
 *
 * const page = await visit("/posts");
 * await expect(heading(page, "Posts")).toBeAbove(button(page, "New post"));
 * await expect(button(page, "Delete")).not.toBeVisible();
 * await expect(page).toHaveURL(/\/posts$/);
 * ```
 */
export interface NuxvelExpect extends Omit<ExpectStatic, never> {
  (actual: Locator, messageOrOptions?: string | { message?: string }): BrowserAssertions<Locator>;
  (actual: Page, messageOrOptions?: string | { message?: string }): BrowserAssertions<Page>;
  <P extends TrpcPath>(actual: TrpcSpy<P>, message?: string): SpyAssertions<P>;
  <T>(actual: T, message?: string): Assertion<void, T>;
}

function isBrowserTarget(value: unknown): value is Locator | Page {
  return typeof value === "object" && value !== null && "_apiName" in value && (value._apiName === "Locator" || value._apiName === "Page");
}

function isTrpcSpy(value: unknown): value is object {
  return typeof value === "function" && trpcSpyPath in value;
}

function spyAssertions(spy: object, isNot: boolean, message: string | undefined): SpyAssertions<TrpcPath> {
  const retry = async (assert: (target: Assertion<void, unknown>) => void, { timeout = browserTimeout }: { timeout?: number } = {}) => {
    const end = timeout ? performance.now() + timeout : Infinity;
    for (;;) {
      try {
        const target = vitestExpect(spy, message);
        return assert(isNot ? target.not : target);
      } catch (error) {
        if (performance.now() >= end) throw error;
        const page = spiedPages.get(spy);
        if (page && pausedClocks.has(page)) await page.clock.runFor(1);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  };

  return {
    get not() {
      return spyAssertions(spy, !isNot, message);
    },
    toHaveBeenCalled: (options) => retry((target) => target.toHaveBeenCalled(), options),
    toHaveBeenCalledTimes: (times, options) => retry((target) => target.toHaveBeenCalledTimes(times), options),
    toHaveBeenCalledWith: (...input) => retry((target) => target.toHaveBeenCalledWith(...input)),
    toHaveBeenLastCalledWith: (...input) => retry((target) => target.toHaveBeenLastCalledWith(...input)),
  };
}

// a Proxy keeps the type of its target, and the apply trap adds the Locator, Page and trpcSpy overloads
export const expect = new Proxy(vitestExpect, {
  apply: (target, _thisArg, [actual, message]: [unknown, string | undefined]) =>
    isBrowserTarget(actual)
      ? browserExpect(actual, message)
      : isTrpcSpy(actual)
        ? spyAssertions(actual, false, message)
        : target(actual, message),
}) as NuxvelExpect;
