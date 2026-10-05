import type { Locator, Page } from "playwright/test";
import type { MatchOptions } from "./match-options";

/**
 * Where a locator helper searches: a whole page, such as the one {@link visit}
 * returns, or a part of it, such as a {@link dialog} or a table row.
 */
export type LocatorScope = Page | Locator;

export type { MatchOptions } from "./match-options";

/**
 * Finds the buttons in `scope` whose accessible name is `name`.
 *
 * Works like `scope.getByRole("button", { name, exact: true })`: it matches
 * the whole name the screen shows or `aria-label` gives, with case. Give
 * `{ exact: false }` to match a part of the name without case, or a `RegExp`
 * to match it as a pattern. See {@link link}, {@link field} and {@link text}.
 *
 * @example
 * ```ts
 * await button(page, "Create post").click();
 * await button(dialog(page), "Delete").click();
 * await button(page, "delete", { exact: false }).first().click();
 * ```
 */
export function button(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByRole("button", { name, exact });
}

/**
 * Finds the links in `scope` whose accessible name is `name`.
 * Matches like {@link button}.
 *
 * @example
 * ```ts
 * await link(page, "Sign in").click();
 * ```
 */
export function link(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByRole("link", { name, exact });
}

/**
 * Finds the headings in `scope` whose text is `name`, at every
 * level. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await expect(heading(page, "New post")).toBeVisible();
 * ```
 */
export function heading(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByRole("heading", { name, exact });
}

/**
 * Finds the form fields in `scope` whose label is `label`: an input, a
 * select or a text area with a `<label>`, `aria-label` or
 * `aria-labelledby`. Works like `scope.getByLabel(label, { exact: true })`.
 * Matches like {@link button}.
 *
 * @example
 * ```ts
 * await field(page, "Email").fill("ada@example.com");
 * ```
 */
export function field(scope: LocatorScope, label: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByLabel(label, { exact });
}

/**
 * Finds the elements in `scope` whose text is `content`, ignoring extra
 * white space. Works like `scope.getByText(content, { exact: true })`,
 * but it skips an element with `aria-hidden="true"`, such as the hidden
 * copy of the text of a Nuxt UI tooltip. Thus it finds only the copy that
 * the user sees. Matches like {@link button}. For a button, a link or a
 * heading, use {@link button}, {@link link} or {@link heading}, which also
 * check the role.
 *
 * @example
 * ```ts
 * await expect(text(page, "Post created")).toBeVisible();
 * ```
 */
export function text(scope: LocatorScope, content: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByText(content, { exact }).and(scope.locator(':not([aria-hidden="true"])'));
}

/**
 * Finds the table cells in `scope` whose text is `name`. Matches
 * like {@link button}.
 *
 * @example
 * ```ts
 * await expect(cell(page, "Harbour festival")).toBeVisible();
 * ```
 */
export function cell(scope: LocatorScope, name: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByRole("cell", { name, exact });
}

/**
 * Finds the dialogs in `scope`, or only the ones whose title is `name`. Use it as the scope of the other helpers to find what is in the
 * dialog. Matches like {@link button}.
 *
 * @example
 * ```ts
 * await button(dialog(page, "Delete post?"), "Delete").click();
 * ```
 */
export function dialog(scope: LocatorScope, name?: string | RegExp, { exact = true }: MatchOptions = {}): Locator {
  return scope.getByRole("dialog", { name, exact });
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
  return scope.getByRole("menu", { name, exact });
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
  return scope.getByRole("menuitem", { name, exact });
}

/**
 * Finds the alerts in `scope`, such as a form error. For a Nuxt UI toast,
 * use {@link toast}.
 *
 * @example
 * ```ts
 * await expect(alert(page)).toHaveText("Post deleted");
 * ```
 */
export function alert(scope: LocatorScope): Locator {
  return scope.getByRole("alert");
}

/** A Playwright locator for a toast, with `dismiss()`. See {@link toast}. */
export type ToastLocator = Locator & { dismiss(): Promise<void> };

export function pageOf(scope: LocatorScope): Page {
  return "page" in scope ? scope.page() : scope;
}

/**
 * Finds the Nuxt UI toasts in `scope` whose text includes `content`, such as a flash message or a toast of `toasted()`.
 *
 * Matches like {@link button}. A toast is outside the dialogs and the other parts of the page, so give `page` as the scope. `dismiss()` clicks the Close button of the toast and waits until the toast is gone.
 * Close a toast before {@link expectAccessible}, or before you check what is under it.
 *
 * @example
 * ```ts
 * await toast(page, "Post created").dismiss();
 * await expect(toast(page, "Post saved")).toBeVisible();
 * ```
 */
export function toast(scope: LocatorScope, content: string | RegExp, { exact = true }: MatchOptions = {}): ToastLocator {
  const locator = scope
    .locator('[data-slot="viewport"]')
    .getByRole("listitem")
    .filter({ has: pageOf(scope).getByText(content, { exact }) });

  return Object.assign(locator, {
    async dismiss() {
      await button(locator, "Close").click();
      await locator.waitFor({ state: "detached" });
    },
  });
}
