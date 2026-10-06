import { z } from "zod";

export const invalidateEmpty = defineAction({
  input: z.object({}),
  handler: () => "empty",
  invalidates: [],
});
