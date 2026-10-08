import { countQueries } from "../../../../../src/runtime/server/database/query-counter";
import { useCaller } from "@nuxvel/nuxt/server/api";

export default defineEventHandler(async () => {
  const caller = useCaller();
  let emails: string[] = [];

  const firstCall = await countQueries(() => caller._sessionCheck.whoami());
  const batchedCalls = await countQueries(async () => {
    emails = await Promise.all([
      caller._sessionCheck.whoami(),
      caller._sessionCheck.whoami(),
      caller._sessionCheck.whoami(),
    ]);
  });

  return { firstCall, batchedCalls, emails };
});
