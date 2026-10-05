import { z } from "zod";

export const probeTransformed = defineEvent({
  payload: z.object({ names: z.string().transform((names) => names.split(",")) }),
});
