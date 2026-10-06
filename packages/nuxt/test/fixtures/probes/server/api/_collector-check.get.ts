import { postsTable } from "~~/server/database/schema/posts.schema";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await useDb().select().from(postsTable).limit(1);
    await $jobs._probe.record.dispatch({ name: "collected" });
    await $mails.welcome.send({ to: "collected@nuxvel.test", name: "Ada" });
  });

  return { ok: true };
});
