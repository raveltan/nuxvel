import { eq, like } from "drizzle-orm";
import { healthChecksTable } from "#nuxvel/schema";

export default defineBackfill({
  table: healthChecksTable,
  batchSize: 2,
  where: like(healthChecksTable.name, "backfill-%"),
  async handler(rows) {
    for (const row of rows) {
      if (row.name.endsWith("-crash")) throw new Error("probe backfill crashed");

      await useDb()
        .update(healthChecksTable)
        .set({ name: `${row.name}+` })
        .where(eq(healthChecksTable.id, row.id));
    }
  },
});
