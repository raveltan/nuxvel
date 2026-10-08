import { defineAction } from "@nuxvel/nuxt/server/actions";

export const invalidateNested = defineAction({
  handler: () => "nested",
  invalidates: ["comment"],
});
