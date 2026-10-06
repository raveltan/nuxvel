import { z } from "zod";

export const invalidateNothing = defineAction({
  input: z.object({}),
  handler: () => "nothing",
});
