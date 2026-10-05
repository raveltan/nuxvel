import { probeHappened } from "~~/server/events/_probe/happened";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await emit(probeHappened, { name: "rolled-back", count: 1 });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  await transaction(async () => {
    await emit(probeHappened, { name: "committed", count: 2 });
  });

  return { ok: true };
});
