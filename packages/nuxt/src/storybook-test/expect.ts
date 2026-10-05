import { type Assertion, type Expect, fn, isMockFunction, expect as storybookExpect } from "storybook/test";
import { browserTimeout, isChecked, isDisabled, isVisible, Locator, normalize, poll, quote, textOf } from "./locator";

type Timeout = { timeout?: number };
type TextOptions = Timeout & { ignoreCase?: boolean };
type Result = { pass: boolean; received: string };
type Procedure = NonNullable<Parameters<typeof fn>[0]>;
type Spy<F extends Procedure> = ReturnType<typeof fn<F>>;

/**
 * The assertions of `expect(locator)` in a `play` function: the names, the
 * arguments and the behaviour of the Playwright locator assertions. Each
 * one tries again until it passes or the timeout ends: 5 seconds, or the
 * `timeout` of the call. Then it fails with the locator, the expected
 * value, the last value it received and the timeout. See {@link expect}.
 */
export interface LocatorAssertions {
  /** The same assertions, negated. */
  readonly not: LocatorAssertions;
  /** Checks that exactly one element matches and is visible. */
  toBeVisible(options?: Timeout): Promise<void>;
  /** Checks that no element matches, or that each element is hidden. */
  toBeHidden(options?: Timeout): Promise<void>;
  /**
   * Checks the whole text of the element, ignoring extra white space.
   *
   * @param ignoreCase - Ignore case. Defaults to `false`.
   */
  toHaveText(expected: string | RegExp, options?: TextOptions): Promise<void>;
  /**
   * Checks that the text of the element contains `expected`.
   *
   * @param ignoreCase - Ignore case. Defaults to `false`.
   */
  toContainText(expected: string | RegExp, options?: TextOptions): Promise<void>;
  /** Checks the value of an input, a text area or a select. */
  toHaveValue(expected: string | RegExp, options?: Timeout): Promise<void>;
  /** Checks the number of elements that match. */
  toHaveCount(expected: number, options?: Timeout): Promise<void>;
  /**
   * Checks that the checkbox, the switch or the radio button is checked.
   *
   * @param checked - `false` checks that it is not checked. Defaults to `true`.
   */
  toBeChecked(options?: Timeout & { checked?: boolean }): Promise<void>;
  /** Checks that the element is disabled, natively or with `aria-disabled="true"`. */
  toBeDisabled(options?: Timeout): Promise<void>;
  /** Checks that the element is not disabled. */
  toBeEnabled(options?: Timeout): Promise<void>;
  /** Checks that the element has the attribute `name`. */
  toHaveAttribute(name: string, options?: Timeout): Promise<void>;
  /** Checks that the attribute `name` of the element has the value `value`. */
  toHaveAttribute(name: string, value: string | RegExp, options?: Timeout): Promise<void>;
}

/**
 * The assertions of `expect(spy)` in a `play` function, for a `fn()` spy
 * such as one from `trpcSpy`. Each one tries again until it passes or
 * the timeout ends: 5 seconds, or the `timeout` of the call. Then it
 * fails with the error of `storybook/test`, which shows the calls and
 * the diff. The arguments of `toHaveBeenCalledWith` and
 * `toHaveBeenLastCalledWith` have the parameter types of the spy. See
 * {@link expect}.
 */
export interface SpyAssertions<F extends Procedure> {
  /** The same assertions, negated. */
  readonly not: SpyAssertions<F>;
  /** Checks that the spy has at least one call. */
  toHaveBeenCalled(options?: Timeout): Promise<void>;
  /** Checks the number of calls of the spy. */
  toHaveBeenCalledTimes(times: number, options?: Timeout): Promise<void>;
  /** Checks that one call of the spy has these arguments. */
  toHaveBeenCalledWith(...args: Parameters<F>): Promise<void>;
  /** Checks that the last call of the spy has these arguments. */
  toHaveBeenLastCalledWith(...args: Parameters<F>): Promise<void>;
}

/**
 * The `expect` of a `play` function: the locator assertions for a
 * {@link Locator}, the {@link SpyAssertions} for a `fn()` spy, and the
 * `expect` of `storybook/test` for any other value. Import it from `@nuxvel/nuxt/storybook/test`, never from
 * `storybook/test` or `vitest`.
 *
 * On a locator, it has the {@link LocatorAssertions} of the Playwright
 * `expect` of an end-to-end test, and they try again until they pass. On
 * any other value, it has the matchers of `storybook/test`, with `.not`,
 * `.resolves`, `.rejects` and the jest-dom matchers, such as
 * `toHaveTextContent`. The static members are the members of
 * `storybook/test`: `expect.any`, `expect.objectContaining` and the other
 * asymmetric matchers.
 *
 * @example
 * ```ts
 * import { button, expect, field, page, text } from "@nuxvel/nuxt/storybook/test";
 *
 * export const BodyEmpty = {
 *   play: async ({ canvasElement }) => {
 *     await button(page, "Save post").click();
 *     await expect(text(page, "Body cannot be empty")).toBeVisible();
 *     await expect(field(page, "Body")).toHaveAttribute("aria-invalid", "true");
 *     await expect(canvasElement).not.toBeEmptyDOMElement();
 *   },
 * };
 * ```
 */
export interface ComponentExpect extends Omit<Expect, never> {
  (actual: Locator, message?: string): LocatorAssertions;
  <F extends Procedure>(actual: Spy<F>, message?: string): SpyAssertions<F>;
  <T>(actual: T, message?: string): Assertion<T>;
}

function one(elements: HTMLElement[], received: (element: HTMLElement) => string, holds: (element: HTMLElement) => boolean): Result {
  const [element] = elements;
  if (!element) return { pass: false, received: "no element matches" };
  if (elements.length > 1) return { pass: false, received: `${elements.length} elements match` };
  return { pass: holds(element), received: received(element) };
}

function matches(actual: string, expected: string | RegExp, whole: boolean, ignoreCase = false) {
  if (expected instanceof RegExp) return new RegExp(expected.source, ignoreCase ? `${expected.flags}i` : expected.flags).test(actual);
  const [left, right] = ignoreCase ? [actual.toLowerCase(), expected.toLowerCase()] : [actual, expected];
  return whole ? left === right : left.includes(right);
}

function normalizeText(expected: string | RegExp) {
  return typeof expected === "string" ? normalize(expected) : expected;
}

function valueOf(element: HTMLElement) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.value : "";
}

function locatorAssertions(locator: Locator, isNot: boolean, message: string | undefined): LocatorAssertions {
  const check = async (matcher: string, expected: string, { timeout = browserTimeout }: Timeout, evaluate: (elements: HTMLElement[]) => Result) => {
    let received = "";
    await poll(
      () => {
        const result = evaluate(Locator.elements(locator));
        received = result.received;
        return result.pass !== isNot || undefined;
      },
      timeout,
      () =>
        `${message ? `${message}\n\n` : ""}expect(locator)${isNot ? ".not" : ""}.${matcher} failed\n\n` +
        `Locator: ${locator}\nExpected: ${isNot ? "not " : ""}${expected}\nReceived: ${received}\nTimeout: ${timeout}ms`,
    );
  };

  return {
    get not() {
      return locatorAssertions(locator, !isNot, message);
    },
    toBeVisible: (options = {}) =>
      check("toBeVisible()", "visible", options, (elements) => one(elements, (element) => (isVisible(element) ? "visible" : "hidden"), isVisible)),
    toBeHidden: (options = {}) =>
      check("toBeHidden()", "hidden", options, (elements) => ({
        pass: !elements.some(isVisible),
        received: elements.length === 0 ? "no element matches" : `${elements.filter(isVisible).length} visible of ${elements.length} elements`,
      })),
    toHaveText: (expected, options = {}) =>
      check(`toHaveText(${quote(expected)})`, quote(expected), options, (elements) =>
        one(elements, (element) => JSON.stringify(textOf(element)), (element) => matches(textOf(element), normalizeText(expected), true, options.ignoreCase)),
      ),
    toContainText: (expected, options = {}) =>
      check(`toContainText(${quote(expected)})`, `text containing ${quote(expected)}`, options, (elements) =>
        one(elements, (element) => JSON.stringify(textOf(element)), (element) => matches(textOf(element), normalizeText(expected), false, options.ignoreCase)),
      ),
    toHaveValue: (expected, options = {}) =>
      check(`toHaveValue(${quote(expected)})`, quote(expected), options, (elements) =>
        one(elements, (element) => JSON.stringify(valueOf(element)), (element) => matches(valueOf(element), expected, true)),
      ),
    toHaveCount: (expected, options = {}) =>
      check(`toHaveCount(${expected})`, String(expected), options, (elements) => ({ pass: elements.length === expected, received: String(elements.length) })),
    toBeChecked: ({ checked = true, ...options } = {}) =>
      check("toBeChecked()", checked ? "checked" : "unchecked", options, (elements) =>
        one(elements, (element) => (isChecked(element) ? "checked" : "unchecked"), (element) => isChecked(element) === checked),
      ),
    toBeDisabled: (options = {}) =>
      check("toBeDisabled()", "disabled", options, (elements) => one(elements, (element) => (isDisabled(element) ? "disabled" : "enabled"), isDisabled)),
    toBeEnabled: (options = {}) =>
      check("toBeEnabled()", "enabled", options, (elements) =>
        one(elements, (element) => (isDisabled(element) ? "disabled" : "enabled"), (element) => !isDisabled(element)),
      ),
    toHaveAttribute: (name: string, valueOrOptions?: string | RegExp | Timeout, maybeOptions: Timeout = {}) => {
      const hasValue = typeof valueOrOptions === "string" || valueOrOptions instanceof RegExp;
      const options = hasValue ? maybeOptions : (valueOrOptions ?? {});
      return check(
        `toHaveAttribute(${JSON.stringify(name)}${hasValue ? `, ${quote(valueOrOptions)}` : ""})`,
        hasValue ? `${name}=${quote(valueOrOptions)}` : `attribute ${name}`,
        options,
        (elements) =>
          one(
            elements,
            (element) => (element.hasAttribute(name) ? `${name}=${JSON.stringify(element.getAttribute(name))}` : `no attribute ${name}`),
            (element) => {
              const value = element.getAttribute(name);
              return value !== null && (!hasValue || matches(value, valueOrOptions, true));
            },
          ),
      );
    },
  };
}

function spyAssertions(spy: unknown, isNot: boolean, message: string | undefined): SpyAssertions<Procedure> {
  const retry = async (assert: (target: Assertion<unknown>) => void, { timeout = browserTimeout }: Timeout = {}) => {
    const end = performance.now() + timeout;
    for (;;) {
      try {
        const target = storybookExpect(spy, message);
        return assert(isNot ? target.not : target);
      } catch (error) {
        if (performance.now() >= end) throw error;
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
    toHaveBeenCalledWith: (...args) => retry((target) => target.toHaveBeenCalledWith(...args)),
    toHaveBeenLastCalledWith: (...args) => retry((target) => target.toHaveBeenLastCalledWith(...args)),
  };
}

// a Proxy keeps the static members of the storybook/test expect, and the apply trap adds the Locator overload
export const expect = new Proxy(storybookExpect, {
  apply: (target, _thisArg, [actual, message]: [unknown, string | undefined]) =>
    actual instanceof Locator
      ? locatorAssertions(actual, false, message)
      : isMockFunction(actual)
        ? spyAssertions(actual, false, message)
        : target(actual, message),
}) as ComponentExpect;
