import { postsTable } from "~~/server/database/schema/posts.schema";
import recordJob from "#server/jobs/_probe/record";
import { welcomeMail } from "#server/mail/welcome.mail";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await useDb().select().from(postsTable).limit(1);
    await recordJob.dispatch({ name: "collected" });
    await welcomeMail.send({ to: "collected@nuxvel.test", name: "Ada" });
  });

  return { ok: true };
});
