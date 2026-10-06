import { z } from "zod";

export const announceQueuedProbe = defineAction({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await $events._probe.queued.emit({ name });
  },
});
