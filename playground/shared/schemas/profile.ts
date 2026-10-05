import { z } from "zod";

export const setAvatarInput = z.object({
  key: z.string(),
});
