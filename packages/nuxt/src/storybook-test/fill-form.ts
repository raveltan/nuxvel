import { userEvent } from "storybook/test";
import { assertControlTakes, controlKind } from "../testing/control-kind";
import { browserTimeout, Locator, normalize, poll } from "./locator";
import { type LocatorScope, field, page } from "./locators";

function radiogroupsByLabel(roots: HTMLElement[], label: string): HTMLElement[] {
  return roots.flatMap((root) =>
    [...root.querySelectorAll("label:not([for])")]
      .filter((element) => normalize(element.textContent) === label)
      .flatMap((element) => {
        let ancestor = element.parentElement;
        while (ancestor && !ancestor.querySelector('[role="radiogroup"]')) ancestor = ancestor.parentElement;
        const group = ancestor?.querySelector<HTMLElement>('[role="radiogroup"]');
        return group ? [group] : [];
      }),
  );
}

/**
 * Fills each form field in `scope` whose label is a key of `values` with its value, in order, in a `play` function.
 *
 * It fills the same controls as the `fillForm` of `@nuxvel/nuxt/testing`, with the same values and the same errors:
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
 * @param scope - The `canvasElement`, {@link page} or a locator that contains the fields.
 * @param values - The label of each field, with the value to give it.
 *
 * @example
 * ```ts
 * await fillForm(canvasElement, { Title: "Hello", Plan: "Pro", "Accept terms": true, Starts: "2026-03-14" });
 * await button(canvasElement, "Create post").click();
 * ```
 */
export async function fillForm(scope: LocatorScope, values: Record<string, string | boolean>): Promise<void> {
  for (const [label, value] of Object.entries(values)) {
    const roots = scope instanceof Locator ? Locator.elements(scope) : [scope];
    const element = await poll(
      () => Locator.elements(field(scope, label))[0] ?? radiogroupsByLabel(roots, label)[0],
      browserTimeout,
      () => `fillForm: no field has the label ${JSON.stringify(label)}`,
    );
    const control = Locator.root(() => element, `field ${JSON.stringify(label)}`);
    const kind = controlKind(element);
    assertControlTakes(label, kind, value);
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
        await userEvent.selectOptions(element, String(value));
        break;
      case "date-segments": {
        const [year, month, day] = String(value).split("-");
        const parts: Record<string, string | undefined> = { year, month, day };
        for (const segment of element.parentElement?.querySelectorAll<HTMLElement>('[role="spinbutton"]') ?? []) {
          await userEvent.click(segment);
          await userEvent.keyboard(parts[segment.dataset.segment ?? ""] ?? "");
        }
        break;
      }
      default:
        await control.fill(String(value));
    }
  }
}
