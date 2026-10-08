import { z } from "zod";
import { probeQueued } from "#server/events/_probe/queued";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const announceQueuedProbe = defineAction({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await probeQueued.emit({ name });
  },
});
