import { defineAction } from "@nuxvel/nuxt/server/actions";
import { experiment, flag } from "@nuxvel/nuxt/server/flags";

export const editorModeAction = defineAction({
  handler: async () => ({
    rollout: await flag("probe-rollout"),
    cta: await experiment("probe-cta"),
  }),
});
