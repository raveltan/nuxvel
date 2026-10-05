import type { Locator } from "playwright/test";
import { assertControlTakes, controlKind } from "./control-kind";
import { type LocatorScope, pageOf } from "./locators";

function radiogroupByLabel(scope: LocatorScope, label: string): Locator {
  return scope.locator(
    `xpath=.//label[not(@for)][normalize-space()=${JSON.stringify(label)}]/ancestor::*[.//*[@role="radiogroup"]][1]//*[@role="radiogroup"]`,
  );
}

/**
 * Fills each form field in `scope` whose label is a key of `values` with its value, in order.
 *
 * Finds each field by its exact label, like {@link field}, and fills it the way its control needs:
 * - An input, a text area or a `<input type="date">` takes a string. A date is an ISO date, `2026-03-14`.
 * - `UCheckbox` and `USwitch` take a boolean.
 * - `USelect`, `USelectMenu` and `URadioGroup` take the label of the option. After a select, it waits until
 *   the list of options is gone, because the focus returns to the select then.
 * - `UInputDate` takes an ISO date, which it types into the day, month and year segments.
 *
 * A `URadioGroup` has no accessible name, so `fillForm` also finds the radio group in the same form field
 * as a `<label>` with that text. Fails when no field has the label, and when a value does not fit the control.
 * Use {@link button} to submit the form.
 *
 * @param values - The label of each field, with the value to give it.
 *
 * @example
 * ```ts
 * await fillForm(page, { Title: "Hello", Plan: "Pro", "Accept terms": true, Starts: "2026-03-14" });
 * await button(page, "Create post").click();
 * ```
 */
export async function fillForm(scope: LocatorScope, values: Record<string, string | boolean>): Promise<void> {
  for (const [label, value] of Object.entries(values)) {
    const control = scope.getByLabel(label, { exact: true }).or(radiogroupByLabel(scope, label));
    const kind = await control.evaluate(controlKind);
    assertControlTakes(label, kind, value);
    const page = pageOf(scope);
    switch (kind) {
      case "toggle":
        await control.setChecked(value === true);
        break;
      case "radiogroup":
        await control.getByRole("radio", { name: String(value), exact: true }).click();
        break;
      case "combobox":
        await control.click();
        await page.getByRole("option", { name: String(value), exact: true }).click();
        await page.getByRole("listbox").waitFor({ state: "detached" });
        break;
      case "select":
        await control.selectOption(String(value));
        break;
      case "date-segments": {
        const [year, month, day] = String(value).split("-");
        const parts: Record<string, string | undefined> = { year, month, day };
        const segments = control.locator("xpath=..").getByRole("spinbutton");
        for (const segment of await segments.all()) {
          await segment.click();
          await page.keyboard.type(parts[(await segment.getAttribute("data-segment")) ?? ""] ?? "");
        }
        break;
      }
      default:
        await control.fill(String(value));
    }
  }
}
