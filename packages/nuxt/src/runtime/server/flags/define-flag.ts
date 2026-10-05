import { awaitingName } from "../discovery/definition-name";

/**
 * A feature flag definition: its name and the value it has when no
 * targeting applies. The name is its file's path under `server/flags/`.
 */
export interface Flag<Name extends string = string> {
  kind: "flag";
  readonly name: Name;
  default: boolean;
  expiresAt?: string;
}

/**
 * Defines a feature flag: an on/off switch whose targeting changes at
 * runtime, without a deploy.
 *
 * `defineFlag` is auto-imported. One flag or experiment per file, under
 * `server/flags/`; the file is discovered, so nothing registers it, and
 * its path is the flag's name (`server/flags/new-checkout.flag.ts` is
 * `"new-checkout"`): what {@link flag}, `useFlag()` and
 * {@link setFlagTargeting} take, and the salt of its percentage buckets.
 * Moving the file renames the flag; {@link renamed} at the old path keeps
 * its targeting and buckets.
 *
 * @param config.default The value for anyone no targeting rule matches.
 * @param config.expiresAt ISO date after which `nuxvel flags:stale`
 * reports the flag as due for removal.
 *
 * @example
 * ```ts
 * // server/flags/new-checkout.flag.ts
 * export const newCheckoutFlag = defineFlag({ default: false, expiresAt: "2026-12-31" });
 * ```
 */
export function defineFlag(config: { default: boolean; expiresAt?: string }): Flag {
  const definition: Flag = { kind: "flag", name: "", ...config };

  return awaitingName(definition, "flag");
}
