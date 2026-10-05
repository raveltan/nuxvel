import { queryAllByLabelText, queryAllByRole, queryAllByText, userEvent } from "storybook/test";
import type { MatchOptions } from "../testing/match-options";

type Step = (elements: HTMLElement[]) => HTMLElement[];
type Role = Parameters<typeof queryAllByRole>[1];
type RoleName = NonNullable<NonNullable<Parameters<typeof queryAllByRole>[2]>["name"]>;
type Timeout = { timeout?: number };

export type { MatchOptions } from "../testing/match-options";

/**
 * The options of {@link Locator.getByRole}: the options of the Playwright
 * `getByRole`, without `disabled`.
 *
 * @param name - The accessible name. Matches like `exact` says.
 * @param exact - See {@link MatchOptions}.
 * @param includeHidden - Also find the elements that are hidden from a screen reader.
 */
export type ByRoleOptions = MatchOptions & {
  name?: string | RegExp;
  checked?: boolean;
  expanded?: boolean;
  includeHidden?: boolean;
  level?: number;
  pressed?: boolean;
  selected?: boolean;
};

export const browserTimeout = 5000;

const dateLikeInput = /^(date|time|datetime-local|month|week|color|range)$/;

export const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function textOf(element: Element) {
  return normalize(element.textContent);
}

export function isVisible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
}

export function isDisabled(element: Element) {
  return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
}

export function isChecked(element: Element) {
  return element instanceof HTMLInputElement ? element.checked : element.getAttribute("aria-checked") === "true";
}

export async function poll<T>(attempt: () => T | undefined, timeout: number, failure: () => string): Promise<T> {
  const end = performance.now() + timeout;
  for (;;) {
    const value = attempt();
    if (value !== undefined) return value;
    if (performance.now() >= end) throw new Error(failure());
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function quote(value: string | RegExp) {
  return value instanceof RegExp ? String(value) : JSON.stringify(value);
}

function roleName(name: string | RegExp | undefined, exact: boolean): RoleName | undefined {
  if (name === undefined || name instanceof RegExp || exact) return name;
  const part = name.toLowerCase();
  return (accessibleName: string) => accessibleName.toLowerCase().includes(part);
}

function includesText(element: HTMLElement, text: string | RegExp) {
  const content = textOf(element);
  return text instanceof RegExp ? text.test(content) : content.toLowerCase().includes(normalize(text).toLowerCase());
}

function waitingFor(elements: HTMLElement[]) {
  const [element] = elements;
  if (!element) return "no element matches";
  if (elements.length > 1) return `${elements.length} elements match`;
  if (!isVisible(element)) return "the element is not visible";
  if (isDisabled(element)) return "the element is disabled";
  return "the element does not take pointer events";
}

function keyboardSyntax(key: string) {
  const keys = key === "+" ? ["+"] : key.endsWith("++") ? [...key.slice(0, -2).split("+"), "+"] : key.split("+");
  const main = keys.pop() ?? "";
  const modifiers = keys.map((modifier) => (modifier === "ControlOrMeta" ? (/Mac/.test(navigator.platform) ? "Meta" : "Control") : modifier));
  const pressed = main.length === 1 ? main.replace(/[{[]/, "$&$&") : `{${main}}`;
  return `${modifiers.map((modifier) => `{${modifier}>}`).join("")}${pressed}${modifiers.reverse().map((modifier) => `{/${modifier}}`).join("")}`;
}

/**
 * A lazy query for elements in a story, with the names, the arguments and
 * the behaviour of the Playwright `Locator`.
 *
 * A locator finds its elements again at each call. An action, such as
 * `click`, waits until exactly one element matches and is visible. A
 * pointer action also waits until the element is enabled and takes
 * pointer events. Reka sets `pointer-events: none` while a popover closes.
 * The wait ends after 5 seconds, or after the `timeout` of the call. The
 * actions use `userEvent` of `storybook/test`, so they show in the
 * Interactions panel of Storybook. The helpers of
 * `@nuxvel/nuxt/storybook/test`, such as {@link button}, return a
 * locator. Check one with {@link expect}.
 */
export class Locator {
  readonly #root: () => HTMLElement;
  readonly #steps: readonly Step[];
  readonly #description: string;

  private constructor(root: () => HTMLElement, steps: readonly Step[], description: string) {
    this.#root = root;
    this.#steps = steps;
    this.#description = description;
  }

  static root(root: () => HTMLElement, description: string): Locator {
    return new Locator(root, [], description);
  }

  static elements(locator: Locator): HTMLElement[] {
    return locator.#from(locator.#root());
  }

  #from(root: HTMLElement) {
    return this.#steps.reduce((elements, step) => step(elements), [root]);
  }

  #then(step: Step, description: string) {
    return new Locator(this.#root, [...this.#steps, step], `${this.#description}.${description}`);
  }

  #within(query: (element: HTMLElement) => HTMLElement[], description: string) {
    return this.#then((elements) => [...new Set(elements.flatMap(query))], description);
  }

  async #element(action: string, { timeout = browserTimeout }: Timeout, pointer: boolean): Promise<HTMLElement> {
    let elements: HTMLElement[] = [];
    return poll(
      () => {
        elements = Locator.elements(this);
        const [element] = elements;
        if (elements.length !== 1 || !element || !isVisible(element)) return undefined;
        if (pointer && (isDisabled(element) || getComputedStyle(element).pointerEvents === "none")) return undefined;
        return element;
      },
      timeout,
      () => `locator.${action}: Timeout ${timeout}ms exceeded.\nwaiting for ${this.#description}\n  - ${waitingFor(elements)}`,
    );
  }

  /** The text that names the locator in a failure message, such as `page.getByRole("button", { name: "Save" })`. */
  toString(): string {
    return this.#description;
  }

  /**
   * Finds the elements with the ARIA `role` in this locator, as Playwright `getByRole` does.
   *
   * @example
   * ```ts
   * await page.getByRole("menuitem", { name: "Sign out" }).click();
   * ```
   */
  getByRole(role: Role, { name, exact = false, includeHidden = false, ...states }: ByRoleOptions = {}): Locator {
    return this.#within(
      (element) => queryAllByRole(element, role, { name: roleName(name, exact), hidden: includeHidden, ...states }),
      `getByRole(${JSON.stringify(role)}${name === undefined ? "" : `, { name: ${quote(name)} }`})`,
    );
  }

  /** Finds the form fields with the label `text` in this locator, as Playwright `getByLabel` does. See {@link field}. */
  getByLabel(text: string | RegExp, { exact = false }: MatchOptions = {}): Locator {
    return this.#within((element) => queryAllByLabelText(element, text, { exact }), `getByLabel(${quote(text)})`);
  }

  /** Finds the elements with the text `text` in this locator, as Playwright `getByText` does. See {@link text}. */
  getByText(text: string | RegExp, { exact = false }: MatchOptions = {}): Locator {
    return this.#within((element) => queryAllByText(element, text, { exact }), `getByText(${quote(text)})`);
  }

  /** Finds the elements that match the CSS `selector` in this locator. */
  locator(selector: string): Locator {
    return this.#within((element) => [...element.querySelectorAll<HTMLElement>(selector)], `locator(${JSON.stringify(selector)})`);
  }

  /**
   * Keeps the elements that contain `hasText` and an element of `has`, as
   * Playwright `filter` does. A string `hasText` matches a part of the
   * text, without case. `has` searches in each element, so it is a locator
   * that starts from `page`.
   *
   * @param has - A locator that each element must contain, such as `page.getByText("Saved")`.
   * @param hasText - A text that each element must contain.
   *
   * @example
   * ```ts
   * await page.getByRole("row").filter({ hasText: "Hello" }).getByRole("button", { name: "Delete" }).click();
   * ```
   */
  filter({ has, hasText }: { has?: Locator; hasText?: string | RegExp } = {}): Locator {
    return this.#then(
      (elements) =>
        elements.filter(
          (element) => (hasText === undefined || includesText(element, hasText)) && (has === undefined || has.#from(element).length > 0),
        ),
      `filter(${[has && `has: ${has.#description}`, hasText !== undefined && `hasText: ${quote(hasText)}`].filter(Boolean).join(", ")})`,
    );
  }

  /**
   * Keeps the elements that `other` also finds, as Playwright `and` does.
   *
   * @example
   * ```ts
   * await page.getByRole("button").and(page.getByText("Save")).click();
   * ```
   */
  and(other: Locator): Locator {
    return this.#then((elements) => {
      const found = new Set(Locator.elements(other));
      return elements.filter((element) => found.has(element));
    }, `and(${other.#description})`);
  }

  /** The element at `index`, from 0. A negative index counts from the end. */
  nth(index: number): Locator {
    return this.#then((elements) => {
      const element = elements.at(index);
      return element ? [element] : [];
    }, `nth(${index})`);
  }

  /** The first element. */
  first(): Locator {
    return this.nth(0);
  }

  /** The last element. */
  last(): Locator {
    return this.nth(-1);
  }

  /** The number of elements that match now. It does not wait. Use `expect(locator).toHaveCount(n)` to wait. */
  async count(): Promise<number> {
    return Locator.elements(this).length;
  }

  /** A locator for each element that matches now. It does not wait. */
  async all(): Promise<Locator[]> {
    return Locator.elements(this).map((_element, index) => this.nth(index));
  }

  /**
   * Waits until the locator is in the `state`: `"visible"` (the default),
   * `"hidden"`, `"attached"` or `"detached"`.
   *
   * @param state - `"visible"`: one visible element. `"hidden"`: no visible element. `"attached"`: one element or more. `"detached"`: no element.
   * @param timeout - In milliseconds. Defaults to 5000.
   */
  async waitFor({ state = "visible", timeout = browserTimeout }: { state?: "attached" | "detached" | "visible" | "hidden" } & Timeout = {}): Promise<void> {
    const holds = {
      attached: (elements: HTMLElement[]) => elements.length > 0,
      detached: (elements: HTMLElement[]) => elements.length === 0,
      visible: (elements: HTMLElement[]) => elements.length === 1 && elements.every(isVisible),
      hidden: (elements: HTMLElement[]) => !elements.some(isVisible),
    }[state];
    let elements: HTMLElement[] = [];
    await poll(
      () => {
        elements = Locator.elements(this);
        return holds(elements) || undefined;
      },
      timeout,
      () => `locator.waitFor: Timeout ${timeout}ms exceeded.\nwaiting for ${this.#description} to be ${state}\n  - ${elements.length} elements match`,
    );
  }

  /** Clicks the element. */
  async click(options: Timeout = {}): Promise<void> {
    await userEvent.click(await this.#element("click", options, true));
  }

  /**
   * Replaces the value of the field with `value`, in one step, as Playwright
   * `fill` does. It pastes the text, so `{` and `[` need no escape. For a
   * date, time, month, week, color or range input, it sets the value and
   * sends the `input` and `change` events.
   *
   * @example
   * ```ts
   * await field(page, "Title").fill("Hello");
   * ```
   */
  async fill(value: string, options: Timeout = {}): Promise<void> {
    const element = await this.#element("fill", options, true);
    if (element instanceof HTMLInputElement && dateLikeInput.test(element.type)) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    await userEvent.clear(element);
    if (value !== "") await userEvent.paste(value);
  }

  /** Empties the field. The same as `fill("")`. */
  async clear(options: Timeout = {}): Promise<void> {
    await this.fill("", options);
  }

  /**
   * Focuses the element and types `text` one key at a time, as Playwright
   * `pressSequentially` does. Use it when the component reacts to each
   * key, such as a search with a debounce. Otherwise use `fill`.
   *
   * @param delay - The time in milliseconds between two keys. Defaults to 0.
   *
   * @example
   * ```ts
   * await field(page, "Search").pressSequentially("hello", { delay: 50 });
   * ```
   */
  async pressSequentially(text: string, { delay = 0, ...options }: { delay?: number } & Timeout = {}): Promise<void> {
    const element = await this.#element("pressSequentially", options, false);
    element.focus();
    await userEvent.type(element, text.replace(/[{[]/g, "$&$&"), { skipClick: true, delay });
  }

  /**
   * Focuses the element and presses `key`, as Playwright `press` does. The
   * key is a Playwright key name, such as `Enter`, `Escape`, `ArrowDown`,
   * `a` or `Control+A`.
   *
   * @example
   * ```ts
   * await field(page, "Search").press("Enter");
   * ```
   */
  async press(key: string, options: Timeout = {}): Promise<void> {
    const element = await this.#element("press", options, false);
    element.focus();
    await userEvent.keyboard(keyboardSyntax(key));
  }

  /**
   * Checks the checkbox, the switch or the radio button, and waits until it
   * is checked. It does nothing when the element is already checked.
   */
  async check(options: Timeout = {}): Promise<void> {
    await this.setChecked(true, options);
  }

  /** Unchecks the checkbox or the switch, and waits until it is not checked. See {@link Locator.check}. */
  async uncheck(options: Timeout = {}): Promise<void> {
    await this.setChecked(false, options);
  }

  /** Checks or unchecks the element, as `checked` says. See {@link Locator.check}. */
  async setChecked(checked: boolean, { timeout = browserTimeout }: Timeout = {}): Promise<void> {
    const element = await this.#element(checked ? "check" : "uncheck", { timeout }, true);
    if (isChecked(element) === checked) return;
    await userEvent.click(element);
    await poll(
      () => isChecked(element) === checked || undefined,
      timeout,
      () => `locator.${checked ? "check" : "uncheck"}: clicking ${this.#description} did not change its state`,
    );
  }

  /** Moves the pointer onto the element. */
  async hover(options: Timeout = {}): Promise<void> {
    await userEvent.hover(await this.#element("hover", options, true));
  }

  /**
   * Moves the pointer off the element, and then moves it once more over
   * the page, as a real mouse does. Thus a Nuxt UI tooltip closes: it
   * waits for a pointer move outside the button and the tooltip.
   * Playwright has no `unhover`: in an end-to-end test, call
   * `page.mouse.move(0, 0)`.
   */
  async unhover(options: Timeout = {}): Promise<void> {
    const element = await this.#element("unhover", options, true);
    await userEvent.unhover(element);
    await new Promise((resolve) => setTimeout(resolve));
    element.ownerDocument.body.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
  }

  /** Focuses the element. */
  async focus(options: Timeout = {}): Promise<void> {
    (await this.#element("focus", options, false)).focus();
  }

  /** Removes the focus from the element. */
  async blur(options: Timeout = {}): Promise<void> {
    (await this.#element("blur", options, false)).blur();
  }
}
