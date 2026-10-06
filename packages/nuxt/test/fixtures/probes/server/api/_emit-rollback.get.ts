import { probeHappened } from "~~/server/events/_probe/happened";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await probeHappened.emit({ name: "rolled-back", count: 1 });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  await transaction(async () => {
    await probeHappened.emit({ name: "committed", count: 2 });
  });

  return { ok: true };
});
