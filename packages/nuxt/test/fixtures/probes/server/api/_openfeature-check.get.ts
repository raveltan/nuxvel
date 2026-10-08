import { OpenFeature } from "@openfeature/server-sdk";
import { nuxvelFlagProvider, setFlagTargeting } from "@nuxvel/nuxt/server/flags";

export default defineEventHandler(async () => {
  await OpenFeature.setProviderAndWait("_openfeature-check", nuxvelFlagProvider());
  const client = OpenFeature.getClient("_openfeature-check");

  await setFlagTargeting("probe-rollout", { percentage: 100 });
  const on = await client.getBooleanValue("probe-rollout", false, { targetingKey: "openfeature-user" });

  await setFlagTargeting("probe-rollout", { percentage: 0 });
  const off = await client.getBooleanValue("probe-rollout", true, { targetingKey: "openfeature-user" });

  return {
    on,
    off,
    variant: await client.getStringValue("probe-cta", "none", { targetingKey: "openfeature-user" }),
    unknown: await client.getBooleanDetails("no-such-flag", true),
    mismatch: await client.getNumberDetails("probe-rollout", 7),
  };
});
