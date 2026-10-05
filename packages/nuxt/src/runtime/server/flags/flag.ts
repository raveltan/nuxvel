import { publishObserved } from "../observe/channels";
import { resolveSubject } from "./evaluation/subject";
import { evaluateFlag } from "./evaluation/evaluate-flag";
import { recordExposure } from "./evaluation/record-exposure";
import type { Flag } from "./define-flag";
import { findFlag, type FlagName, flagStoredName } from "./registry";
import { flagTargeting } from "./targeting";

/** Who a flag or experiment is evaluated for: a user id and, for role targeting, their role. */
export interface FlagSubject {
  id: string;
  role?: string;
}

/**
 * Whether a flag, given by its name or its definition (`$flags.newCheckout`
 * or an import), is on for the current user.
 *
 * Auto-imported on the server. Evaluates against the targeting set with
 * {@link setFlagTargeting}: a rule for the user's role wins, then the
 * percentage rollout, then the flag's `default`. Percentage buckets are
 * deterministic — the same user always gets the same answer at the same
 * percentage.
 *
 * The user is the actor of the running action when that actor is a
 * `"user"` ({@link useAuth}), else, inside a request, the
 * signed-in one from `auth()`. Pass `subject` to evaluate for someone
 * else, or outside both (a task). With no user, a partial rollout is off. Throws when no flag
 * has this name.
 *
 * Each call records an exposure in `flag_exposures`: one row per user
 * per value, however often they see it. Nothing is recorded with no
 * user, and the row is written outside any ambient transaction, so a
 * rollback does not erase it.
 *
 * @param subject Evaluate for this user instead of the signed-in one.
 *
 * @example
 * ```ts
 * if (await flag("new-checkout")) return renderNewCheckout();
 * if (await flag($flags.newCheckout)) return renderNewCheckout();
 * ```
 */
export async function flag(
  nameOrFlag: FlagName | Flag,
  subject?: FlagSubject,
): Promise<boolean> {
  const name = typeof nameOrFlag === "string" ? nameOrFlag : nameOrFlag.name;
  const definition = findFlag(name);
  const targeting = await flagTargeting(definition);
  const resolved = await resolveSubject(subject);

  const stored = flagStoredName(definition);
  const value = evaluateFlag(stored, definition.default, targeting, resolved);

  await recordExposure(stored, resolved, String(value));
  publishObserved("flag:evaluation", { kind: "flag", name, value });

  return value;
}
