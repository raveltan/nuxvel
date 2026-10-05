import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

export default defineEventHandler(async () => {
  const fired: string[] = [];

  try {
    await useDb().transaction(async () => {
      await useDb().insert(healthChecksTable).values({});
      throw new Error("boom");
    });
  } catch {}

  const rowsAfterRollback = (await useDb().select().from(healthChecksTable)).length;
  let firedInsideTransaction = -1;

  await useDb().transaction(async () => {
    await useDb().insert(healthChecksTable).values({});
    onCommit(() => {
      fired.push("committed");
    });
    firedInsideTransaction = fired.length;
  });

  const rowsAfterCommit = (await useDb().select().from(healthChecksTable)).length;

  return { rowsAfterRollback, rowsAfterCommit, firedInsideTransaction, fired };
});
