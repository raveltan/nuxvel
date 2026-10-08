import { setFlagTargeting } from "@nuxvel/nuxt/server/flags";

export default defineEventHandler(async (event) => {
  await setFlagTargeting("probe-rollout", await readBody(event));

  return { ok: true };
});
