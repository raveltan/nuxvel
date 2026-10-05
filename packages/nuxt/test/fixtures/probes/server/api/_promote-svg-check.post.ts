import { z } from "zod";

const promoteSchema = z.object({
  upload: z.enum(["_svg-rasterized", "_svg-sanitized"]),
  key: z.string(),
  to: z.string(),
});

export default defineEventHandler(async (event) => promoteUpload(await readValidatedBody(event, promoteSchema.parse)));
