import { defineFlag } from "@nuxvel/nuxt/server/flags";

export const probeRolloutFlag = defineFlag({
  default: false,
  expiresAt: "2026-01-01",
});
