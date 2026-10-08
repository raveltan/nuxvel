import { defineAction } from "@nuxvel/nuxt/server/actions";

export const invalidateNothing = defineAction({
  handler: () => "nothing",
});
