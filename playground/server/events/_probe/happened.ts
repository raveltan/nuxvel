import { z } from "zod";

export const probeHappened = defineEvent({
  payload: z.object({ name: z.string().min(1), count: z.number() }),
});
