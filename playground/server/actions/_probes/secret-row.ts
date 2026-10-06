import { z } from "zod";

export const secretRow = defineAction({
  procedure: "public",
  output: z.object({ id: z.number() }),
  handler: () => ({ id: 1, passwordHash: "hash" }),
});
