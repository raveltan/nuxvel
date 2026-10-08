import { z } from "zod";
import { defineEvent } from "@nuxvel/nuxt/server/events";

export const probeTransformed = defineEvent({
  payload: z.object({ names: z.string().transform((names) => names.split(",")) }),
});
