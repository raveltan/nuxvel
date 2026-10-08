import { flagConversionsTable } from "~~/server/database/schema/flag-conversions.schema";
import { flagExposuresTable } from "~~/server/database/schema/flag-exposures.schema";
import { useDb } from "@nuxvel/nuxt/server/database";
import { experimentReport, track } from "@nuxvel/nuxt/server/flags";

function units(variant: string, total: number) {
  return Array.from({ length: total }, (_, index) => `${variant}-${index}`);
}

async function seed(variant: string, exposed: number, converted: number) {
  const ids = units(variant, exposed);

  await useDb()
    .insert(flagExposuresTable)
    .values(ids.map((unitId) => ({ name: "probe-cta", unitId, variant })));

  if (converted === 0) return;

  await useDb()
    .insert(flagConversionsTable)
    .values(
      ids
        .slice(0, converted)
        .map((unitId) => ({ name: "probe-cta", unitId, metric: "probe.converted" })),
    );
}

export default defineEventHandler(async (event) => {
  const { scenario } = getQuery(event);

  if (scenario === "track") {
    await seed("green", 1, 0);
    await track("probe.converted", { id: "green-0" });
    await track("probe.converted", { id: "green-0" });
    await track("probe.converted", { id: "never-exposed" });

    return useDb().select({ unitId: flagConversionsTable.unitId }).from(flagConversionsTable);
  }

  if (scenario === "skewed") {
    await seed("control", 100, 0);
    await seed("green", 50, 0);
  } else {
    await seed("control", 100, 10);
    await seed("green", 100, 25);
  }

  return experimentReport("probe-cta");
});
