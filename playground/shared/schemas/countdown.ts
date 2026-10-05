import { z } from "zod";

export const countdownInput = z.object({
  fail: z.boolean(),
});
