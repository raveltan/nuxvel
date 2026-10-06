import { z } from "zod";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { healthCheckPolicy } from "~~/server/policies/health-check.policy";
import { postPolicy } from "~~/server/policies/post.policy";

declare const post: typeof postsTable.$inferSelect;
declare const healthCheck: typeof healthChecksTable.$inferSelect;

export const canPost = can("update", postsTable, post);

// @ts-expect-error can() reads the ambient actor and takes none
export const canWithActor = can(systemActor("_policy-type-check"), "update", postsTable, post);

// @ts-expect-error authorize() reads the ambient actor and takes none
export const authorizeWithActor = authorize(systemActor("_policy-type-check"), postPolicy.update, post);

// @ts-expect-error posts' policy defines no "updat" rule
export const canMisspelledRule = can("updat", postsTable, post);

// @ts-expect-error healthChecks' policy defines "update" and "probe", not "delete"
export const canOtherTablesRule = can("delete", healthChecksTable, healthCheck);

// @ts-expect-error can() takes a row of the table it checks
export const canWrongRow = can("update", postsTable, healthCheck);

export const authorizePost = authorize("update", postsTable, post);

// @ts-expect-error posts' policy defines no "updat" rule
export const authorizeMisspelledRule = authorize("updat", postsTable, post);

// @ts-expect-error authorize() takes a row of the table it checks
export const authorizeWrongRow = authorize("update", postsTable, healthCheck);

export const rulesReadTheirTable = definePolicy(postsTable, {
  // @ts-expect-error a posts rule gets a posts row, which has no name
  update: (_actor, row) => row.name === "probe",
});

export const canManyPosts: Promise<Record<"update" | "delete", boolean>[]> = canMany(["update", "delete"], postsTable, [post]);

// @ts-expect-error posts' policy defines no "updat" rule
export const canManyMisspelledRule = canMany(["updat"], postsTable, [post]);

export const rulesReadThePreload = definePolicy(postsTable, {
  preload: () => ({ editors: new Set<string>() }),
  rules: {
    // @ts-expect-error the preload returns editors, not owners
    update: (_actor, _row, { owners }) => owners.size > 0,
  },
});

export const canPostByRef: Promise<boolean> = can(postPolicy.update, post);

export const postUpdateRef: AbilityRef<typeof postsTable, "update"> = postPolicy.update;

// @ts-expect-error posts' policy defines no "updat" rule
export const misspelledRef = postPolicy.updat;

// @ts-expect-error a posts ref takes a posts row
export const canRefWrongRow = can(postPolicy.update, healthCheck);

export const authorizePostByRef: Promise<void> = authorize(postPolicy.update, post);

// @ts-expect-error a health check ref takes a health check row
export const authorizeRefWrongRow = authorize(healthCheckPolicy.update, post);

export const canManyByRef: Promise<Record<"update" | "delete", boolean>[]> = canMany([postPolicy.update, postPolicy.delete], [post]);

// @ts-expect-error the refs name update and delete, not restore
export const canManyByRefWrongKeys: Promise<Record<"restore", boolean>[]> = canMany([postPolicy.update, postPolicy.delete], [post]);

// @ts-expect-error a policy field is not a rule ref
export const fieldIsNoRef: AbilityRef = definePolicy(postsTable, { table: () => true }).table;

export const canPostByNamespace: Promise<boolean> = can($policies.post.update, post);

export const namespacedPolicyIsTheExport: typeof healthCheckPolicy = $policies.healthCheck;

// @ts-expect-error a posts ref from $policies takes a posts row
export const canNamespaceRefWrongRow = can($policies.post.update, healthCheck);

type IsAny<T> = 0 extends 1 & T ? true : false;

declare const postId: number;

const foundPost = findAuthorized(postsTable, postId, "update");

export const findAuthorizedIsTyped: IsAny<Awaited<typeof foundPost>> extends true
  ? never
  : Awaited<typeof foundPost> extends typeof postsTable.$inferSelect
    ? true
    : never = true;

// @ts-expect-error posts' policy defines no "updat" rule
export const findAuthorizedMisspelledRule = findAuthorized(postsTable, postId, "updat");

// @ts-expect-error a posts id is a number
export const findAuthorizedWrongId = findAuthorized(postsTable, "1", "update");

const postAbilitiesSchema = withAbilities(z.object({ id: z.number(), authorId: z.string() }), [postPolicy.update, postPolicy.delete]);

type PostAbilities = z.output<typeof postAbilitiesSchema>["can"];

export const withAbilitiesIsTyped: IsAny<PostAbilities> extends true
  ? never
  : [PostAbilities, Record<"update" | "delete", boolean>] extends [Record<"update" | "delete", boolean>, PostAbilities]
    ? true
    : never = true;

export const withAbilitiesKeepsTheRow: z.output<typeof postAbilitiesSchema>["authorId"] = "author";

// @ts-expect-error withAbilities() takes ability refs, not rule names
export const withAbilitiesByName = withAbilities(z.object({ id: z.number() }), ["update"]);
