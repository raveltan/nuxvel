import { z } from "zod";

export const formProbeInput = z.object({
  title: z.string().min(1),
  status: z.enum(["draft", "published"]).default("draft"),
  note: z.string(),
});
