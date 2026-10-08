import { flagExposuresTable } from "~~/server/database/schema/flag-exposures.schema";
import { useDb } from "@nuxvel/nuxt/server/database";
import { experiment, flag } from "@nuxvel/nuxt/server/flags";

export default defineEventHandler(async (event) => {
  const { subject } = getQuery(event);

  if (typeof subject === "string") {
    await experiment("probe-cta", { id: subject });
    await experiment("probe-cta", { id: subject });
    await flag("probe-rollout", { id: subject });
  }

  const rows = await useDb()
    .select({
      name: flagExposuresTable.name,
      unitId: flagExposuresTable.unitId,
      variant: flagExposuresTable.variant,
    })
    .from(flagExposuresTable);

  return rows.sort((a, b) => a.name.localeCompare(b.name));
});
