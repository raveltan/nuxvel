import { policyRegistry } from "../../../../../src/runtime/server/policies/registry";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { definePolicy } from "@nuxvel/nuxt/server/authorization";

export default defineEventHandler(() => {
  const first = definePolicy(postsTable, { update: () => true });
  const second = definePolicy(postsTable, { delete: () => true });

  try {
    policyRegistry([first, second]);
    return { threw: null };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
});
