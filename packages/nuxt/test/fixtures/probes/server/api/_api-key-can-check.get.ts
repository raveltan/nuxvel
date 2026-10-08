import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { captureSqlQueries } from "../../../../../src/runtime/server/database/query-counter";
import { authorize, can } from "@nuxvel/nuxt/server/authorization";
import { insertOne } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  const row = await insertOne(healthChecksTable, { name: "api key can" });
  const queries = await captureSqlQueries(async () => {
    await can("update", healthChecksTable, row);
    await authorize("probe", healthChecksTable, row).catch(() => undefined);
  });
  const keyQueries = queries.filter((query) => query.includes('"api_keys"'));

  return {
    lookups: keyQueries.filter((query) => query.startsWith("select")).length,
    lastUsedUpdates: keyQueries.filter((query) => query.startsWith("update")).length,
  };
});
