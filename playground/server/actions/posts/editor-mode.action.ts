import { z } from "zod";

export const editorModeAction = defineAction({
  input: z.object({}),
  handler: async () => ({
    rollout: await flag("probe-rollout"),
    cta: await experiment("probe-cta"),
  }),
});
