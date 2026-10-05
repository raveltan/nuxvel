import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { healthCheckPolicy } from "~~/server/policies/health-check.policy";
import { postPolicy } from "~~/server/policies/post.policy";

declare const post: typeof postsTable.$inferSelect;
declare const healthCheck: typeof healthChecksTable.$inferSelect;

const actor = systemActor("_policy-type-check");

export const canPost = can(actor, "update", postsTable, post);

// @ts-expect-error posts' policy defines no "updat" rule
export const canMisspelledRule = can(actor, "updat", postsTable, post);

// @ts-expect-error healthChecks' policy defines "update" and "probe", not "delete"
export const canOtherTablesRule = can(actor, "delete", healthChecksTable, healthCheck);

// @ts-expect-error can() takes a row of the table it checks
export const canWrongRow = can(actor, "update", postsTable, healthCheck);

export const authorizePost = authorize(actor, "update", postsTable, post);

// @ts-expect-error posts' policy defines no "updat" rule
export const authorizeMisspelledRule = authorize(actor, "updat", postsTable, post);

// @ts-expect-error authorize() takes a row of the table it checks
export const authorizeWrongRow = authorize(actor, "update", postsTable, healthCheck);

export const rulesReadTheirTable = definePolicy(postsTable, {
  // @ts-expect-error a posts rule gets a posts row, which has no name
  update: (_actor, row) => row.name === "probe",
});

export const canManyPosts: Promise<Record<"update" | "delete", boolean>[]> = canMany(actor, ["update", "delete"], postsTable, [post]);

// @ts-expect-error posts' policy defines no "updat" rule
export const canManyMisspelledRule = canMany(actor, ["updat"], postsTable, [post]);

export const rulesReadThePreload = definePolicy(postsTable, {
  preload: () => ({ editors: new Set<string>() }),
  rules: {
    // @ts-expect-error the preload returns editors, not owners
    update: (_actor, _row, { owners }) => owners.size > 0,
  },
});

export const canPostByRef: Promise<boolean> = can(actor, postPolicy.update, post);

export const postUpdateRef: AbilityRef<typeof postsTable, "update"> = postPolicy.update;

// @ts-expect-error posts' policy defines no "updat" rule
export const misspelledRef = postPolicy.updat;

// @ts-expect-error a posts ref takes a posts row
export const canRefWrongRow = can(actor, postPolicy.update, healthCheck);

export const authorizePostByRef: Promise<void> = authorize(actor, postPolicy.update, post);

// @ts-expect-error a health check ref takes a health check row
export const authorizeRefWrongRow = authorize(actor, healthCheckPolicy.update, post);

export const canManyByRef: Promise<Record<"update" | "delete", boolean>[]> = canMany(actor, [postPolicy.update, postPolicy.delete], [post]);

// @ts-expect-error the refs name update and delete, not restore
export const canManyByRefWrongKeys: Promise<Record<"restore", boolean>[]> = canMany(actor, [postPolicy.update, postPolicy.delete], [post]);

// @ts-expect-error a policy field is not a rule ref
export const fieldIsNoRef: AbilityRef = definePolicy(postsTable, { table: () => true }).table;

export const canPostByNamespace: Promise<boolean> = can(actor, $policies.post.update, post);

export const namespacedPolicyIsTheExport: typeof healthCheckPolicy = $policies.healthCheck;

// @ts-expect-error a posts ref from $policies takes a posts row
export const canNamespaceRefWrongRow = can(actor, $policies.post.update, healthCheck);
