import { z } from "zod";
import { transaction } from "@nuxvel/nuxt/server/database";
import { deleteStoredFiles, promoteUpload } from "@nuxvel/nuxt/server/storage";

const body = z.object({
  scenario: z.enum(["promote-rollback", "promote-savepoint-rollback", "promote-outer-rollback", "delete-commit", "delete-rollback"]),
  key: z.string(),
  to: z.string(),
});

class Rollback extends Error {}

const promote = (key: string, to: string) => promoteUpload({ upload: "profile-avatar", key, to });

export default defineEventHandler(async (event) => {
  const { scenario, key, to } = await readValidatedBody(event, body.parse);
  const scenarios = {
    "promote-rollback": async () => {
      await promote(key, to);
      throw new Rollback();
    },
    "promote-savepoint-rollback": () =>
      transaction(async () => {
        await promote(key, to);
        throw new Rollback();
      }).catch(() => undefined),
    "promote-outer-rollback": async () => {
      await transaction(() => promote(key, to));
      throw new Rollback();
    },
    "delete-commit": () => deleteStoredFiles([key, to]),
    "delete-rollback": async () => {
      await deleteStoredFiles([key, to]);
      throw new Rollback();
    },
  };

  await transaction(scenarios[scenario]).catch((error: unknown) => {
    if (!(error instanceof Rollback)) throw error;
  });

  return { ok: true };
});
