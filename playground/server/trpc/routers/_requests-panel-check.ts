import { postsTable } from "#nuxvel/schema";
import recordJob from "#server/jobs/_probe/record";
import { publicProcedure } from "@nuxvel/nuxt/server/api";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";

export default {
  load: publicProcedure.query(async () => {
    await transaction(async () => {
      await useDb().select().from(postsTable).limit(1);
      await recordJob.dispatch({ name: "requests-panel" });
    });

    return "loaded";
  }),
};
