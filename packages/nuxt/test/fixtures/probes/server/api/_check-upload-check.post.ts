import { z } from "zod";
import { ValidationFailedError } from "@nuxvel/nuxt/server/api";
import { checkUpload } from "@nuxvel/nuxt/server/storage";

export default defineEventHandler(async (event) => {
  const { key } = await readValidatedBody(event, z.object({ key: z.string() }).parse);

  return checkUpload({ upload: "profile-avatar", key }).then(
    () => ({ fields: {} }),
    (error: unknown) => {
      if (error instanceof ValidationFailedError) return { fields: error.fields };
      throw error;
    },
  );
});
