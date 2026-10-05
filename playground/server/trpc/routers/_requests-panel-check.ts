import { postsTable } from "../../database/schema/posts.schema";

export default {
  load: publicProcedure.query(async () => {
    await transaction(async () => {
      await useDb().select().from(postsTable).limit(1);
      await dispatchAfterCommit("_probe.record", { name: "requests-panel" });
    });

    return "loaded";
  }),
};
