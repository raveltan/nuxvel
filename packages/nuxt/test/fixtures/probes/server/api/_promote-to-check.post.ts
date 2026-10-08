import { z } from "zod";
import { promoteUpload } from "@nuxvel/nuxt/server/storage";

const promoteSchema = z.object({ key: z.string(), to: z.string() });

export default defineEventHandler(async (event) =>
  promoteUpload({ upload: "profile-avatar", ...(await readValidatedBody(event, promoteSchema.parse)) }).then(
    () => ({ refused: null }),
    (error: Error) => ({ refused: error.message }),
  ),
);
