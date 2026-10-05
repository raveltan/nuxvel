export const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Reka UI puts a focusable aria-hidden span on each side of open toasts to catch Tab, which axe flags as aria-hidden-focus.
export const TOAST_FOCUS_PROXIES = '[role="region"]:has(> [data-slot="viewport"]) > [aria-hidden="true"][tabindex="0"]';
