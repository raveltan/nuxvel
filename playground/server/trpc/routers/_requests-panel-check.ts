import { postsTable } from "#nuxvel/schema";

export default {
  load: publicProcedure.query(async () => {
    await transaction(async () => {
      await useDb().select().from(postsTable).limit(1);
      await $jobs._probe.record.dispatch({ name: "requests-panel" });
    });

    return "loaded";
  }),
};
