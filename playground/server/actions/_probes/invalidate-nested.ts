import { z } from "zod";

export const invalidateNested = defineAction({
  input: z.object({}),
  handler: () => "nested",
  invalidates: ["comment"],
});
