/**
 * The kind of control that a labelled form element is, as {@link controlKind} decides it.
 */
export type ControlKind = "text" | "select" | "combobox" | "toggle" | "radiogroup" | "date-segments";

type ControlElement = {
  tagName: string;
  getAttribute(name: string): string | null;
  parentElement: { querySelector(selector: string): unknown } | null;
};

/**
 * Decides which Nuxt UI or native control a labelled element is, from the DOM alone.
 *
 * `fillForm` uses it to choose how to fill the field. It has no imports and uses no variable outside
 * itself, so Playwright can send it into the page with `locator.evaluate(controlKind)`, and a browser
 * can call it directly. It imports no Playwright and no Node code.
 */
export function controlKind(element: ControlElement): ControlKind {
  const role = element.getAttribute("role");
  if (role === "radiogroup") return "radiogroup";
  if (role === "checkbox" || role === "switch") return "toggle";
  if (element.tagName === "INPUT" && ["checkbox", "radio"].includes(element.getAttribute("type") ?? "")) return "toggle";
  if (role === "combobox" && element.tagName === "BUTTON") return "combobox";
  if (element.getAttribute("aria-haspopup") === "listbox") return "combobox";
  if (element.tagName === "SELECT") return "select";
  if (element.getAttribute("aria-hidden") === "true" && element.parentElement?.querySelector('[role="spinbutton"]')) return "date-segments";
  return "text";
}

export function assertControlTakes(label: string, kind: ControlKind, value: string | boolean): void {
  if ((kind === "toggle") !== (typeof value === "boolean")) {
    throw new Error(`fillForm: "${label}" is a ${kind} control and cannot take the ${typeof value} ${JSON.stringify(value)}`);
  }
}
