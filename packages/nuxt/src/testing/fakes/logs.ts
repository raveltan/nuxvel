import type { ObservedLog } from "../../runtime/server/observe/channels";
import type { LogLevelName } from "../../runtime/shared/env/log-settings";
import { recordedEffects } from "../recorded";
import { expectRecorded } from "./records";
import { type TextMatch, textMatches } from "./text-match";

/**
 * Asserts that the app logged a line at `level` during the test, and returns the latest such line.
 *
 * Sees only the lines at or above `NUXT_LOG_LEVEL`, which is `info` by default, from {@link useLogger}. Cleared after every test by `@nuxvel/nuxt/testing/setup`.
 *
 * @param level The level of the line, such as `"warn"`.
 * @param match Text that the message contains, or a pattern it matches.
 * @param options.times How many matching lines there must be, 1 or more.
 *
 * @example
 * ```ts
 * await expectLogged("warn", "charge retried");
 * ```
 */
export async function expectLogged(level: LogLevelName, match: TextMatch, options: { times?: number } = {}): Promise<ObservedLog> {
  const { logs } = await recordedEffects();

  return expectRecorded(
    "expectLogged",
    `a ${level} log line matching ${String(match)}`,
    logs,
    (line) => line.level === level && textMatches(match, line.message),
    options.times,
  );
}
