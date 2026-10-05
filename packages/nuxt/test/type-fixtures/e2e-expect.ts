import type { Page } from "playwright-core";
import { expect } from "../../src/testing/expect";
import { fillForm } from "../../src/testing/fill-form";
import { button, dialog, field, toast } from "../../src/testing/locators";

declare const page: Page;

type IsAny<T> = 0 extends 1 & T ? true : false;

const assertion = expect(page.locator("h1"));
export const typed: IsAny<typeof assertion> extends true ? never : true = true;

await assertion.toBeVisible();
await expect(page).toHaveURL(/\/posts$/);

const save = button(page, "Save");
export const typedLocator: IsAny<typeof save> extends true ? never : true = true;
const layoutAssertion = expect(save).toBeAbove;
export const typedLayout: IsAny<typeof layoutAssertion> extends true ? never : true = true;

const saved = toast(page, "Saved");
export const typedToast: IsAny<typeof saved> extends true ? never : true = true;
await saved.dismiss();
await fillForm(page, { Title: "x" });

await fillForm(page, { Done: true });

// @ts-expect-error a value is a string or a boolean
await fillForm(page, { Count: 1 });

await expect(field(page, "Email")).toBeAbove(save, { timeout: 1000 });
await expect(button(page, "save", { exact: false })).toHaveCount(1);
await expect(dialog(page, undefined, { exact: false })).toHaveCount(1);

// @ts-expect-error exact is a boolean
button(page, "Save", { exact: "yes" });

// @ts-expect-error a locator helper takes only exact
field(page, "Email", { level: 1 });
await expect(save).not.toBeRightOf(button(dialog(page, "Delete post?"), "Delete"));

// @ts-expect-error a layout assertion compares with a locator
await expect(save).toBeLeftOf("Cancel");

// @ts-expect-error a layout assertion is only on a locator
await expect(page).toBeBelow(save);

// @ts-expect-error toHaveCount needs a number
await expect(page.locator("tr")).toHaveCount("2");

const pageAssertion = expect(page);
export const typedPage: IsAny<typeof pageAssertion> extends true ? never : true = true;
const valueAssertion = expect(1);
export const typedValue: IsAny<typeof valueAssertion> extends true ? never : true = true;

declare const call: Promise<{ id: number; title: string }>;
await expect(call).rejects.toBeTrpcError("FORBIDDEN");
await expect(call).resolves.toEqual({ id: expect.any(Number), title: expect.stringContaining("Hi") });
await expect(call).rejects.toHaveValidationErrors({ title: expect.any(String) });
expect(1).not.toBe(2);
expect.soft(1).toBe(1);
expect.assertions(1);
await expect.poll(() => 1).toBe(1);
await expect(save).not.toBeVisible();
await expect(page).not.toHaveURL("/");

// @ts-expect-error a tRPC code is one of the tRPC error codes
await expect(call).rejects.toBeTrpcError("NOPE");

// @ts-expect-error the nuxvel matchers are only on a value
await expect(save).toBeTrpcError("FORBIDDEN");

// @ts-expect-error toBeVisible is only on a locator
expect(1).toBeVisible();

// @ts-expect-error toHaveURL is only on a page
await expect(save).toHaveURL("/");
