import { goDown } from "../../../../../src/runtime/server/maintenance/state";

export default defineEventHandler(async () => {
  await rateLimiter("_shared-probe").consume("durable-state");
  await setFlagTargeting("probe-rollout", { percentage: 10 });
  await goDown({ keepQueue: true });

  return { ok: true };
});
