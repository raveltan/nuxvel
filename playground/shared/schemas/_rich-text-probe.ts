import { z } from "zod";

export const richTextProbeInput = z.object({
  body: richText({ max: 200 }),
});
