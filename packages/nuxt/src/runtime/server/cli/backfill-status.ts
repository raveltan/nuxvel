import { writeFile } from "node:fs/promises";
import { asc } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import type { BackfillListing } from "./backfill-listing";

export async function runBackfillStatus(outFile: string): Promise<number> {
  const backfills = schemaTable("backfills");
  const statuses = await useDb().select().from(backfills).orderBy(asc(backfills.name));
  const listing: BackfillListing = {
    backfills: statuses.map((status) => ({
      name: status.name,
      processed: status.processed,
      total: status.total,
      cursor: status.cursor,
      completedAt: status.completedAt?.toISOString() ?? null,
    })),
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}
