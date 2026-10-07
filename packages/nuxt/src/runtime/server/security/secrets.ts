import { envHint } from "../../shared/env/env-hints";
import { now } from "../clock/now";

/**
 * Every value a rotatable secret currently accepts: the current one
 * first, then the previous one while its grace period lasts.
 *
 * Auto-imported on the server. Sign with the first entry, verify against
 * all of them. `nuxvel key:rotate <name>` writes `<name>`,
 * `<name>_PREVIOUS` and `<name>_PREVIOUS_EXPIRES_AT` to `.env`; the
 * server reads them from its environment, so a rotation applies once the
 * server restarts with the new values. The grace period's end is checked
 * on every call, so the previous value stops verifying on time without
 * one.
 *
 * Throws when `name` is not set, so a missing secret fails loudly instead
 * of verifying nothing.
 *
 * @param name The env var holding the secret, e.g. `NUXT_WEBHOOK_SECRET`.
 *
 * @example
 * ```ts
 * const [signing] = useSecrets("NUXT_WEBHOOK_SECRET");
 * const valid = useSecrets("NUXT_WEBHOOK_SECRET").some(
 *   (secret) => hmac(secret, body) === signature,
 * );
 * ```
 */
export function useSecrets(name: string): [current: string, ...previous: string[]] {
  const current = process.env[name];

  if (!current) throw new Error(`${name} is not set. ${envHint(name)}`);

  const previous = process.env[`${name}_PREVIOUS`];
  const expiresAt = process.env[`${name}_PREVIOUS_EXPIRES_AT`];

  if (!previous || !expiresAt) return [current];
  if (Date.parse(expiresAt) <= now().getTime()) return [current];

  return [current, previous];
}
