import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";

const CLAIM_TIMEOUT_MS = 2000;

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await useDb()
    .insert(outboxTable)
    .values(
      ["one", "two", "three"].map((name) => ({
        jobName: "_probe.record",
        payload: { name },
      })),
    );

  let claimed = () => {};
  let released = () => {};
  const rowsClaimed = new Promise<void>((resolve) => (claimed = resolve));
  const relayDone = new Promise<void>((resolve) => (released = resolve));

  const other = transaction(async () => {
    await useDb().select().from(outboxTable).for("update");
    claimed();
    await relayDone;
    throw new Error("the other relay died before it enqueued anything");
  }).catch(() => undefined);

  await rowsClaimed;

  const whileClaimed = await Promise.race([
    relayOutbox(),
    new Promise<number>((resolve) => setTimeout(() => resolve(-1), CLAIM_TIMEOUT_MS)),
  ]);

  released();
  await other;

  const afterRelease = await relayOutbox();
  const waiting = await useQueue().getWaiting();
  const rows = await useDb().select().from(outboxTable);

  return {
    whileClaimed,
    afterRelease,
    jobs: waiting.length,
    undispatched: rows.filter((row) => row.dispatchedAt === null).length,
  };
});
