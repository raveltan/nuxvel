import { defineAction } from "@nuxvel/nuxt/server/actions";

export const invalidateEmpty = defineAction({
  handler: () => "empty",
  invalidates: [],
});
