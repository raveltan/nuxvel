import { eq } from "drizzle-orm";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  try {
    await transaction(async () => {
      await dispatchAfterCommit("_probe.record", { name: "rolled-back" });
      throw new Error("boom");
    });
  } catch {}

  await transaction(async () => {
    await dispatchAfterCommit("_probe.record", { name: "committed" });
  });

  await dispatchAfterCommit("_probe.record", { name: "immediate" });
  await dispatchAfterCommit($jobs._probe.record, { name: "by-definition" });

  await transaction(async () => {
    try {
      await transaction(async () => {
        await dispatchAfterCommit("_probe.record", { name: "nested-rolled-back" });
        throw new Error("inner boom");
      });
    } catch {}

    await dispatchAfterCommit("_probe.record", { name: "nested-committed" });
  });

  // @ts-expect-error the runtime check behind the compile-time one
  const unknown = await dispatchAfterCommit("probe.missing", {}).then(
    () => undefined,
    (error: Error) => error.message,
  );
  const unknownRows = await useDb()
    .select()
    .from(outboxTable)
    .where(eq(outboxTable.jobName, "probe.missing"));

  return { unknown, unknownRows: unknownRows.length };
});
