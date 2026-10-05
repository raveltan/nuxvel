import type { AxeResults, RunOptions } from "axe-core";
import { TOAST_FOCUS_PROXIES, WCAG_21_AA } from "../accessibility-rules";

/**
 * The part of a Playwright `Page` {@link expectAccessible} uses, so the
 * testing entry does not need `playwright-core` installed to typecheck.
 */
export interface AccessibilityPage {
  evaluate(script: string): Promise<unknown>;
  url(): string;
}

function hasViolations(value: unknown): value is Pick<AxeResults, "violations"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "violations" in value &&
    Array.isArray(value.violations)
  );
}

const FINITE_ANIMATIONS_DONE = `(async () => {
  const pending = () => document.getAnimations().filter((animation) =>
    animation.playState === "running" && animation.effect?.getComputedTiming().endTime !== Infinity &&
    !animation.effect?.target?.closest('[data-slot="progress"]'));
  for (let list = pending(); list.length > 0; list = pending()) {
    await Promise.allSettled(list.map((animation) => animation.finished));
  }
})()`;

/** Options for {@link expectAccessible}. */
export interface ExpectAccessibleOptions {
  /**
   * axe rule ids to skip, each with the reason it cannot pass — for a
   * third-party widget you don't control. An empty reason throws.
   *
   * @example
   * ```ts
   * { disable: { "color-contrast": "embedded map tiles are drawn by the provider" } }
   * ```
   */
  disable?: Record<string, string>;
}

async function axeSource() {
  try {
    const { default: axe } = await import("axe-core");
    return axe.source;
  } catch (cause) {
    throw new Error("expectAccessible needs axe-core: install it as a dev dependency", { cause });
  }
}

function describeViolations(violations: AxeResults["violations"]) {
  return violations
    .map((violation) => {
      const elements = violation.nodes
        .map((node) => `    ${node.target.join(" ")}`)
        .join("\n");

      return `${violation.id}: ${violation.help}\n${elements}\n    fix: ${violation.helpUrl}`;
    })
    .join("\n\n");
}

/**
 * Runs axe-core against the page as it is now and fails on any WCAG 2.1
 * AA violation, naming the rule, the offending elements and a link to
 * the fix. Needs `axe-core` installed as a dev dependency.
 *
 * Call it in an end-to-end test after each page load and after anything
 * that changes the page substantially (a dialog opening, a form
 * failing). It first waits for the running animations of the page to
 * finish, but not the endless ones or the timer bar of a toast, because colours measured during a
 * fade fail the contrast rule. Skip a rule only through `disable`, with a reason. It skips
 * the two hidden focus catchers Nuxt UI adds next to open toasts, so a
 * page can be checked while a toast shows.
 *
 * @param page - A Playwright page, e.g. from `createPage()`.
 * @param options - See {@link ExpectAccessibleOptions}.
 *
 * @example
 * ```ts
 * import { expectAccessible } from "@nuxvel/nuxt/testing";
 *
 * const page = await createPage("/posts");
 * await expectAccessible(page);
 * ```
 */
export async function expectAccessible(page: AccessibilityPage, options: ExpectAccessibleOptions = {}) {
  const disabled = Object.entries(options.disable ?? {});
  const unexplained = disabled.filter(([, reason]) => !reason.trim()).map(([rule]) => rule);

  if (unexplained.length > 0) {
    throw new Error(
      `expectAccessible: give a reason for disabling ${unexplained.join(", ")}`,
    );
  }

  const runOptions: RunOptions = {
    runOnly: { type: "tag", values: WCAG_21_AA },
    rules: Object.fromEntries(disabled.map(([rule]) => [rule, { enabled: false }])),
  };

  await page.evaluate(FINITE_ANIMATIONS_DONE);
  await page.evaluate(await axeSource());
  const results = await page.evaluate(`axe.run({ exclude: [...document.querySelectorAll(${JSON.stringify(TOAST_FOCUS_PROXIES)})] }, ${JSON.stringify(runOptions)})`);

  if (!hasViolations(results)) throw new Error("expectAccessible: axe-core returned no results");

  const { violations } = results;

  if (violations.length > 0) {
    throw new Error(
      `expectAccessible: ${violations.length} accessibility violation(s) on ${page.url()}\n\n${describeViolations(violations)}`,
    );
  }
}
