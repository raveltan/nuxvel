import { z } from "zod";
import { probeHappened } from "#server/events/_probe/happened";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const announceProbe = defineAction({
  input: z.object({ name: z.string().min(1), count: z.number(), fail: z.boolean() }),
  handler: async ({ name, count, fail }) => {
    await probeHappened.emit({ name, count });

    if (fail) throw new Error("boom");
  },
});
