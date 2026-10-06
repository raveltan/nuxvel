import { Locator, type MatchOptions } from "./locator";

/**
 * Where a locator helper searches: {@link page}, a {@link Locator} such as
 * a {@link dialog}, or the `canvasElement` of the `play` function.
 * A dialog, a menu and a toast render outside `canvasElement`, so find them
 * in `page`.
 */
export type LocatorScope = Locator | HTMLElement;

/**
 * The whole document of the story, as a {@link Locator}. It takes the place
 * of the Playwright `page` that `visit()` returns in an end-to-end test, so
 * a `play` function reads like the end-to-end test.
 *
 * @example
 * ```ts
 * await button(page, "Save post").click();
 * ```
 */
export const page: Locator = Locator.root(() => document.body, "page");

function scoped(scope: LocatorScope): Locator {
  return scope instanceof Locator ? scope : Locator.root(() => scope, "canvas");
}

/**
 * Finds the buttons in `scope` whose accessible name is `name`, like the
 * `button` of `@nuxvel/nuxt/testing`.
 *
 * It matches the whole name, with case. Give `{ exact: false }` to match a
 * part of the name without case, or a `RegExp`. See {@link link},
 * {@link field} and {@link text}.
 *
 * @example
 * ```ts
 * await button(page, "Save post").click();
 * await button(dialog(page, "Delete post?"), "Delete").click();
 * ```
 */
export function button(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("button", { name, exact });
}

/**
 * Finds the links in `scope` whose accessible name is `name`. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await expect(link(page, "Edit Hello")).toBeVisible();
 * ```
 */
export function link(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("link", { name, exact });
}

/**
 * Finds the headings in `scope` whose text is `name`, at every level. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await expect(heading(page, "New post")).toBeVisible();
 * ```
 */
export function heading(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("heading", { name, exact });
}

/**
 * Finds the form fields in `scope` whose label is `label`: a `<label>`,
 * `aria-label` or `aria-labelledby`. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await field(page, "Title").fill("Hello");
 * ```
 */
export function field(scope: LocatorScope, label: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByLabel(label, { exact });
}

/**
 * Finds the elements in `scope` whose text is `content`, ignoring extra
 * white space, like the `text` of `@nuxvel/nuxt/testing`. It skips an
 * element with `aria-hidden="true"`, such as the hidden copy of the text
 * of a Nuxt UI tooltip. Thus it finds only the copy that the user sees.
 * Matches like {@link button}. For a button, a link or a heading, use
 * {@link button}, {@link link} or {@link heading}.
 *
 * @example
 * ```ts
 * await expect(text(page, "Body cannot be empty after trimming")).toBeVisible();
 * ```
 */
export function text(scope: LocatorScope, content: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  const within = scoped(scope);
  return within.getByText(content, { exact }).and(within.locator(':not([aria-hidden="true"])'));
}

/**
 * Finds the table cells in `scope` whose text is `name`. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await expect(cell(page, "Harbour festival")).toBeVisible();
 * ```
 */
export function cell(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("cell", { name, exact });
}

/**
 * Finds the dialogs in `scope`, or only the ones whose title is `name`.
 * Use it as the scope of the other helpers. A `UModal` renders outside
 * `canvasElement`, so give `page` as the scope. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await button(dialog(page, "Delete post?"), "Delete").click();
 * ```
 */
export function dialog(scope: LocatorScope, name?: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("dialog", { name, exact });
}

/**
 * Finds the menus in `scope`, or only the ones whose name is `name`, such
 * as the dropdown that a user menu button opens. Use it as the scope of
 * {@link menuitem}. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await expect(menu(page)).toBeVisible();
 * ```
 */
export function menu(scope: LocatorScope, name?: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("menu", { name, exact });
}

/**
 * Finds the menu items in `scope` whose accessible name is `name`.
 * Matches like {@link button}.
 *
 * @example
 * ```ts
 * await button(page, user.email).click();
 * await menuitem(page, "Sign out").click();
 * ```
 */
export function menuitem(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scoped(scope).getByRole("menuitem", { name, exact });
}

/**
 * Finds the alerts in `scope`, such as a form error. For a Nuxt UI toast, use {@link toast}.
 *
 * @example
 * ```ts
 * await expect(alert(page)).toHaveText("Post deleted");
 * ```
 */
export function alert(scope: LocatorScope): Locator {
  return scoped(scope).getByRole("alert");
}

/** A {@link Locator} for a toast, with `dismiss()`. See {@link toast}. */
export type ToastLocator = Locator & { dismiss(): Promise<void> };

/**
 * Finds the Nuxt UI toasts in `scope` whose text includes `content`, such
 * as the `toast` option of a mutation. A toast renders outside `canvasElement`, so
 * give `page` as the scope. Matches like {@link button}.
 *
 * `dismiss()` clicks the Close button of the toast and waits until the toast is gone.
 *
 * @example
 * ```ts
 * await expect(toast(page, "Post saved")).toBeVisible();
 * await toast(page, "Post saved").dismiss();
 * ```
 */
export function toast(scope: LocatorScope, content: string | RegExp, { exact = true }: MatchOptions = {}): ToastLocator {
  const locator = scoped(scope)
    .locator('[data-slot="viewport"]')
    .getByRole("listitem")
    .filter({ has: page.getByText(content, { exact }) });

  return Object.assign(locator, {
    async dismiss() {
      await button(locator, "Close").click();
      await locator.waitFor({ state: "detached" });
    },
  });
}
