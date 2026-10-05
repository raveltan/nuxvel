import {
  getTableName,
  type InferSelectModel,
  type Table,
} from "drizzle-orm";
import type { Actor } from "../actions/system-actor";

/**
 * One authorization rule: given the actor and the row, may it happen?
 * May be async, e.g. to check membership. `preloaded` is what the
 * policy's `preload` returned, or `undefined` when it has none.
 */
// Method syntax makes `row` and `preloaded` bivariant, so every table's policy fits one registry.
export type PolicyRule<Row = Record<string, unknown>, Preloaded = unknown> = {
  rule(actor: Actor, row: Row, preloaded: Preloaded): boolean | Promise<boolean>;
}["rule"];

/**
 * Loads what a policy's rules need for a list of rows in one query, for
 * {@link canMany}. {@link can} calls it with the one row.
 */
export type PolicyPreload<Row = Record<string, unknown>, Preloaded = unknown> = {
  preload(actor: Actor, rows: Row[]): Preloaded | Promise<Preloaded>;
}["preload"];

/**
 * Marks a rule as reachable by system actors.
 *
 * By default {@link can} denies `systemActor(...)` on every rule, so
 * background work cannot silently bypass user-shaped checks. Wrap the
 * specific rules that jobs legitimately need.
 *
 * @example
 * ```ts
 * export const postPolicy = definePolicy(postsTable, {
 *   purge: allowSystem(() => true),
 * });
 * ```
 */
export function allowSystem<Row, Preloaded>(rule: PolicyRule<Row, Preloaded>): PolicyRule<Row, Preloaded> {
  const wrapped: PolicyRule<Row, Preloaded> = (actor, row, preloaded) => rule(actor, row, preloaded);
  return Object.assign(wrapped, { allowsSystem: true });
}

/** Whether a rule was wrapped in {@link allowSystem}. Used by {@link can}. */
export function ruleAllowsSystem(rule: PolicyRule): boolean {
  return "allowsSystem" in rule && rule.allowsSystem === true;
}

/**
 * A table's authorization rules, as returned by {@link definePolicy}:
 * `T` is the table and `Rules` the names of its rules, which is what
 * {@link can} and {@link authorize} accept for that table.
 */
export interface Policy<T extends Table = Table, Rules extends string = string, Preloaded = unknown> {
  table: T;
  tableName: string;
  rules: Record<Rules, PolicyRule<InferSelectModel<T>, Preloaded>>;
  preload?: PolicyPreload<InferSelectModel<T>, Preloaded>;
}

/**
 * A reference to one rule of a policy, such as `postPolicy.update`. It
 * holds the table, so {@link can}, {@link authorize} and {@link canMany}
 * take it in place of the rule name and the table. Go-to-definition on
 * it opens the rule in the policy file.
 */
export interface AbilityRef<T extends Table = Table, Rule extends string = string> {
  table: T;
  rule: Rule;
}

const POLICY_FIELDS = ["table", "tableName", "rules", "preload"];

type AbilityRefs<T extends Table, Rules> = Omit<{ [Rule in keyof Rules]: AbilityRef<T, Rule & string> }, keyof Policy>;

/** Whether `value` is a policy from {@link definePolicy}. */
export function isPolicy(value: unknown): value is Policy {
  return typeof value === "object" && value !== null && "tableName" in value && "rules" in value;
}

interface PreloadingPolicy {
  preload: PolicyPreload;
  rules: Record<string, PolicyRule>;
}

function isPreloading(policy: Record<string, PolicyRule> | PreloadingPolicy): policy is PreloadingPolicy {
  return typeof policy.preload === "function" && typeof policy.rules === "object";
}

/**
 * Defines the authorization rules for one table.
 *
 * Export the result as a named export ending with `Policy` from a file
 * under `server/policies/`; policies are discovered from there, never
 * registered. The `row` argument is typed from the table, and the rule
 * names become the only actions {@link can} and {@link authorize} accept
 * for it.
 *
 * The result also has an {@link AbilityRef} for each rule, so
 * `can(actor, postPolicy.update, post)` works beside the string form. A
 * rule named `table`, `tableName`, `rules` or `preload` gets no ref.
 *
 * Pass `{ preload, rules }` instead of the rules when a rule needs more
 * data than the row. `preload` gets the actor and every row being
 * checked, and its result is each rule's third argument, so
 * {@link canMany} checks a list with one query.
 *
 * @example
 * ```ts
 * export const postPolicy = definePolicy(postsTable, {
 *   update: (actor, post) => post.authorId === actor.id,
 *   delete: (actor, post) => post.authorId === actor.id,
 * });
 *
 * export const postPolicy = definePolicy(postsTable, {
 *   preload: async (actor, rows) => ({ editors: await editorsOf(actor, rows) }),
 *   rules: {
 *     update: (actor, post, { editors }) => editors.has(post.id),
 *   },
 * });
 * ```
 */
export function definePolicy<T extends Table, Preloaded, Rules extends Record<string, PolicyRule<InferSelectModel<T>, NoInfer<Preloaded>>>>(
  table: T,
  policy: {
    preload: PolicyPreload<InferSelectModel<T>, Preloaded>;
    rules: Rules;
  },
): Policy<T, keyof Rules & string, Preloaded> & AbilityRefs<T, Rules>;
export function definePolicy<T extends Table, Rules extends Record<string, PolicyRule<InferSelectModel<T>, undefined>>>(
  table: T,
  rules: Rules,
): Policy<T, keyof Rules & string, undefined> & AbilityRefs<T, Rules>;
export function definePolicy(table: Table, rulesOrPolicy: Record<string, PolicyRule> | PreloadingPolicy): Policy {
  const tableName = getTableName(table);
  const policy = isPreloading(rulesOrPolicy)
    ? { table, tableName, ...rulesOrPolicy }
    : { table, tableName, rules: rulesOrPolicy };
  const refs = Object.keys(policy.rules)
    .filter((rule) => !POLICY_FIELDS.includes(rule))
    .map((rule) => [rule, { table, rule }]);

  return { ...Object.fromEntries(refs), ...policy };
}
