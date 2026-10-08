import { z } from "zod";
import { promoteUpload } from "@nuxvel/nuxt/server/storage";

const promoteSchema = z.object({
  upload: z.enum(["_svg-rasterized", "_svg-sanitized"]),
  key: z.string(),
  to: z.string(),
});

export default defineEventHandler(async (event) => promoteUpload(await readValidatedBody(event, promoteSchema.parse)));
