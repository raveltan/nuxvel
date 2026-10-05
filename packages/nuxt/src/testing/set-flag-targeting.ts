import type { Flag } from "../runtime/server/flags/define-flag";
import type { FlagName } from "../runtime/server/flags/registry";
import type { FlagTargeting } from "../runtime/server/flags/targeting";
import { callApp } from "./settled";

/**
 * Replaces a flag's targeting in the app under test, the test-side
 * counterpart of the server's {@link setFlagTargeting}.
 *
 * The next {@link flag} evaluation in the app sees it. Like the server
 * helper, it writes a `flag.targeted` audit row. Each test starts with
 * no targeting: `@nuxvel/nuxt/testing/database` empties Redis after
 * each test.
 *
 * @param flag A {@link FlagName}, or the flag's definition or its stub
 * from `#nuxvel/test-namespaces`; a name no flag defines fails to compile.
 *
 * @example
 * ```ts
 * await setFlagTargeting("new-editor", { percentage: 100 });
 * await setFlagTargeting($flags.newEditor, { percentage: 0 });
 * ```
 */
export async function setFlagTargeting(flag: FlagName | Flag, targeting: FlagTargeting): Promise<void> {
  await callApp("flag-targeting", { name: typeof flag === "string" ? flag : flag.name, targeting });
}

/**
 * Turns a flag on for every user in the app under test.
 *
 * It replaces the whole targeting, so role overrides are gone. Like
 * {@link setFlagTargeting}, it writes a `flag.targeted` audit row. See
 * also {@link disableFlag}.
 *
 * @param flag A {@link FlagName}, or the flag's definition or its stub
 * from `#nuxvel/test-namespaces`; a name no flag defines fails to compile.
 *
 * @example
 * ```ts
 * await enableFlag("new-editor");
 * await enableFlag($flags.newEditor);
 * ```
 */
export async function enableFlag(flag: FlagName | Flag): Promise<void> {
  await setFlagTargeting(flag, { percentage: 100 });
}

/**
 * Turns a flag off for every user in the app under test.
 *
 * It replaces the whole targeting, so role overrides are gone. Like
 * {@link setFlagTargeting}, it writes a `flag.targeted` audit row. See
 * also {@link enableFlag}.
 *
 * @param flag A {@link FlagName}, or the flag's definition or its stub
 * from `#nuxvel/test-namespaces`; a name no flag defines fails to compile.
 *
 * @example
 * ```ts
 * await disableFlag("new-editor");
 * await disableFlag($flags.newEditor);
 * ```
 */
export async function disableFlag(flag: FlagName | Flag): Promise<void> {
  await setFlagTargeting(flag, { percentage: 0 });
}
