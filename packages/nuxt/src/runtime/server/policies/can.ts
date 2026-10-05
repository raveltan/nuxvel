import { getTableName, type InferSelectModel, type Table } from "drizzle-orm";
import discoveredPolicies from "#nuxvel/policies";
import { type Actor, SYSTEM_ACTOR_TYPE } from "../actions/system-actor";
import { publishObserved } from "../observe/channels";
import type { AbilityRef, Policy, PolicyRule } from "./define-policy";
import { ruleAllowsSystem } from "./define-policy";
import { policyRegistry } from "./registry";

let registry: Map<string, Policy> | undefined;

type DiscoveredPolicy = (typeof discoveredPolicies)[number];

/**
 * The rule names the policy discovered for table `T` defines: the
 * actions {@link can} and {@link authorize} accept for it. `never` when
 * no policy covers `T`.
 */
export type PolicyAction<T extends Table> = DiscoveredPolicy extends infer P
  ? P extends Policy<infer PolicyTable, infer Rules>
    ? [T] extends [PolicyTable]
      ? Rules
      : never
    : never
  : never;

function policyFor(table: Table) {
  registry ??= policyRegistry(discoveredPolicies);
  return registry.get(getTableName(table));
}

function ruleFor(policy: Policy | undefined, action: string) {
  return policy && Object.hasOwn(policy.rules, action) ? policy.rules[action] : undefined;
}

async function decide(
  actor: Actor,
  action: string,
  table: Table,
  rule: PolicyRule | undefined,
  row: Record<string, unknown>,
  preloaded: unknown,
) {
  const allowed = rule !== undefined
    && (actor.type !== SYSTEM_ACTOR_TYPE || ruleAllowsSystem(rule))
    && (await rule(actor, row, preloaded)) === true;

  publishObserved("policy:decision", {
    action,
    table: getTableName(table),
    actor: `${actor.type}:${actor.id}`,
    allowed,
  });

  return allowed;
}

export type CanArgs = [ability: AbilityRef, row: Record<string, unknown>] | [action: string, table: Table, row: Record<string, unknown>];

export function abilityCall(args: CanArgs): [action: string, table: Table, row: Record<string, unknown>] {
  return args.length === 2 ? [args[0].rule, args[0].table, args[1]] : args;
}

/**
 * Whether the actor may perform an action on `row`, according to the
 * policy discovered for the row's table. Pass an {@link AbilityRef} such
 * as `postPolicy.update`, or the rule name and the table. The name must
 * be one of the rules the table's policy defines ({@link PolicyAction}),
 * so a misspelled rule or a table with no policy fails to compile.
 *
 * Auto-imported on the server. Returns `false` when no policy or no
 * matching rule exists at runtime, and when a system actor hits a rule
 * that is not wrapped in {@link allowSystem}. Throws when two files
 * under `server/policies/` define a policy for the same table. Runs the
 * policy's `preload` for this one row. Use {@link authorize} to throw
 * instead, and {@link canMany} to check a list.
 *
 * @example
 * ```ts
 * if (await can(ctx.actor, postPolicy.delete, post)) { }
 * if (await can(ctx.actor, "delete", postsTable, post)) { }
 * ```
 */
export function can<T extends Table>(actor: Actor, ability: AbilityRef<T>, row: InferSelectModel<T>): Promise<boolean>;
export function can<T extends Table>(
  actor: Actor,
  action: PolicyAction<T>,
  table: T,
  row: InferSelectModel<T>,
): Promise<boolean>;
export async function can(actor: Actor, ...args: CanArgs): Promise<boolean> {
  return canByName(actor, ...abilityCall(args));
}

export async function canByName(actor: Actor, action: string, table: Table, row: Record<string, unknown>) {
  const policy = policyFor(table);

  return decide(actor, action, table, ruleFor(policy, action), row, await policy?.preload?.(actor, [row]));
}

/**
 * Checks several actions on every row of a list, and returns one
 * `{ [action]: boolean }` object per row, in the order of `rows`. Pass
 * {@link AbilityRef}s of one policy, or the rule names and the table.
 *
 * Auto-imported on the server. Calls the policy's `preload` once for the
 * whole list, so the check runs the same queries for 1 row as for 100.
 * Each answer is the one {@link can} gives for that row.
 *
 * @example
 * ```ts
 * const abilities = await canMany(ctx.actor, [postPolicy.update, postPolicy.delete], rows);
 * return rows.map((post, index) => ({ ...post, can: abilities[index] }));
 * ```
 */
export function canMany<T extends Table, Action extends string>(
  actor: Actor,
  abilities: readonly AbilityRef<T, Action>[],
  rows: InferSelectModel<T>[],
): Promise<Record<Action, boolean>[]>;
export function canMany<T extends Table, Action extends PolicyAction<T>>(
  actor: Actor,
  actions: readonly Action[],
  table: T,
  rows: InferSelectModel<T>[],
): Promise<Record<Action, boolean>[]>;
export async function canMany(
  actor: Actor,
  ...args: [abilities: readonly AbilityRef[], rows: Record<string, unknown>[]] | [actions: readonly string[], table: Table, rows: Record<string, unknown>[]]
): Promise<Record<string, boolean>[]> {
  if (args.length === 3) return canManyByName(actor, ...args);

  const [abilities, rows] = args;
  const [first] = abilities;
  if (!first) return rows.map(() => ({}));

  return canManyByName(actor, abilities.map((ability) => ability.rule), first.table, rows);
}

async function canManyByName(actor: Actor, actions: readonly string[], table: Table, rows: Record<string, unknown>[]) {
  const policy = policyFor(table);
  const preloaded = rows.length > 0 ? await policy?.preload?.(actor, rows) : undefined;

  return Promise.all(
    rows.map(async (row) => {
      const answers = await Promise.all(
        actions.map(async (action) => [action, await decide(actor, action, table, ruleFor(policy, action), row, preloaded)]),
      );

      return Object.fromEntries(answers);
    }),
  );
}
