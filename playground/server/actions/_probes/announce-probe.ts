import { z } from "zod";
import { probeHappened } from "../../events/_probe/happened";

export const announceProbe = defineAction({
  input: z.object({ name: z.string().min(1), count: z.number(), fail: z.boolean() }),
  handler: async ({ name, count, fail }) => {
    await emit(probeHappened, { name, count });

    if (fail) throw new Error("boom");
  },
});
