import { z } from "zod";
import { defineEvent } from "@nuxvel/nuxt/server/events";

export const probeHappened = defineEvent({
  payload: z.object({ name: z.string().min(1), count: z.number() }),
});
