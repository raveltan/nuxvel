import { z } from "zod";
import { richText } from "@nuxvel/nuxt/shared/html";

export const richTextProbeInput = z.object({
  body: richText({ max: 200 }),
});
