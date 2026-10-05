import { getTableName, type Table } from "drizzle-orm";
import type { ObservedPolicyDecision } from "../../runtime/server/observe/channels";
import type { PolicyAction } from "../../runtime/server/policies/can";
import { recordedEffects } from "../recorded";
import { expectRecorded } from "./records";

/**
 * Asserts that the app asked a policy whether an actor may do `action` on a row of `table` during the test, and returns the latest such decision.
 *
 * Sees every answer of {@link can}, {@link canMany} and {@link authorize}. Fails when a procedure never asked the policy. Cleared after every test by `@nuxvel/nuxt/testing/setup`.
 *
 * @param action A rule of the table's policy, so a rule that no policy defines fails to compile.
 * @param options.allowed Only counts decisions with this answer.
 * @param options.times How many matching decisions there must be, 1 or more.
 *
 * @example
 * ```ts
 * await expect(actingAs(other).trpc.post.update({ id: post.id, title: "x" })).rejects.toThrow();
 * await expectPolicyChecked("update", postsTable, { allowed: false });
 * ```
 */
export async function expectPolicyChecked<T extends Table>(
  action: PolicyAction<T>,
  table: T,
  options: { allowed?: boolean; times?: number } = {},
): Promise<ObservedPolicyDecision> {
  const { policyDecisions } = await recordedEffects();
  const tableName = getTableName(table);

  return expectRecorded(
    "expectPolicyChecked",
    `a policy check of "${action}" on ${tableName}${options.allowed === undefined ? "" : ` answered ${options.allowed ? "allowed" : "refused"}`}`,
    policyDecisions,
    (decision) =>
      decision.action === action && decision.table === tableName && (options.allowed === undefined || decision.allowed === options.allowed),
    options.times,
  );
}
