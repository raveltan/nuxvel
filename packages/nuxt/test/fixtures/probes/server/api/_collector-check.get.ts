import { postsTable } from "~~/server/database/schema/posts.schema";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await useDb().select().from(postsTable).limit(1);
    await dispatchAfterCommit("_probe.record", { name: "collected" });
    await sendMail("welcome", { to: "collected@nuxvel.test", name: "Ada" });
  });

  return { ok: true };
});
