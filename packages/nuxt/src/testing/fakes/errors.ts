import type { ObservedError } from "../../runtime/server/observe/channels";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded } from "./records";
import { type TextMatch, textMatches } from "./text-match";

/**
 * Asserts that the app handed an error to error tracking during the test, and returns the latest such error.
 *
 * Sees what reaches {@link reportError}: an unexpected error of a procedure (also one that `actingAs()` and `guest()` call), a 500 of a route, a failed job run in the app. A 4xx tRPC error is not reported. Cleared after every test by `@nuxvel/nuxt/testing/setup`. Use {@link expectNoErrorReported} for the opposite.
 *
 * @param match Text that the error message contains, or a pattern it matches. Defaults to any error.
 * @param options.times How many matching errors there must be, 1 or more.
 *
 * @example
 * ```ts
 * await expect(api.post.publish({ id })).rejects.toThrow();
 * await expectErrorReported("stripe timeout");
 * ```
 */
export async function expectErrorReported(match?: TextMatch, options: { times?: number } = {}): Promise<ObservedError> {
  const { errors } = await recordedEffects();

  return expectRecorded(
    "expectErrorReported",
    `a reported error${match === undefined ? "" : ` matching ${String(match)}`}`,
    errors,
    (error) => textMatches(match, error.message),
    options.times,
  );
}

/**
 * Asserts that the app handed no error to error tracking during the test. On failure, it lists the reported errors. The opposite of {@link expectErrorReported}.
 *
 * @example
 * ```ts
 * await api.post.list();
 * await expectNoErrorReported();
 * ```
 */
export async function expectNoErrorReported(): Promise<void> {
  const { errors } = await recordedEffects();

  expectNotRecorded("expectNoErrorReported", "a reported error", errors, () => true);
}
