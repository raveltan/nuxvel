import { goDown } from "../../../../../src/runtime/server/maintenance/state";
import { setFlagTargeting } from "@nuxvel/nuxt/server/flags";
import { rateLimiter } from "@nuxvel/nuxt/server/security";

export default defineEventHandler(async () => {
  await rateLimiter("_shared-probe").consume("durable-state");
  await setFlagTargeting("probe-rollout", { percentage: 10 });
  await goDown({ keepQueue: true });

  return { ok: true };
});
