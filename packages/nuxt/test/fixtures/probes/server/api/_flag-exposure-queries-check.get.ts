import { countQueries } from "../../../../../src/runtime/server/database/query-counter";
import { flag } from "@nuxvel/nuxt/server/flags";

export default defineEventHandler(async () => {
  const subject = { id: "repeat-user" };

  return {
    queries: await countQueries(async () => {
      await flag("probe-rollout", subject);
      await flag("probe-rollout", subject);
      await flag("probe-rollout", subject);
    }),
  };
});
