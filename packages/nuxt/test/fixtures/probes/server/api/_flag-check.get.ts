import { defineFlag, experiment, flag, setFlagTargeting, startExperiment } from "@nuxvel/nuxt/server/flags";

const USERS = Array.from({ length: 200 }, (_, index) => ({
  id: `flag-user-${index}`,
  role: index % 2 === 0 ? "beta-tester" : "user",
}));

async function share(on: (user: (typeof USERS)[number]) => Promise<boolean>) {
  const results = await Promise.all(USERS.map(on));

  return results.filter(Boolean).length;
}

export default defineEventHandler(async () => {
  const untargeted = await share((user) => flag("probe-rollout", user));

  await setFlagTargeting("probe-rollout", { percentage: 0 });
  const atZero = await share((user) => flag("probe-rollout", user));

  await setFlagTargeting("probe-rollout", { percentage: 100 });
  const atHundred = await share((user) => flag("probe-rollout", user));

  await setFlagTargeting("probe-rollout", { percentage: 30 });
  const atThirty = await share((user) => flag("probe-rollout", user));
  const atThirtyAgain = await share((user) => flag($flags.probeRollout, user));

  await setFlagTargeting($flags.probeRollout, { roles: { "beta-tester": true } });
  const roleTargeted = await Promise.all(
    USERS.slice(0, 4).map(async (user) => ({
      role: user.role,
      on: await flag("probe-rollout", user),
    })),
  );

  const beforeStart = await Promise.all(
    USERS.map((user) => experiment("probe-cta", user)),
  );

  await startExperiment($experiments.probeCta);

  const variants = await Promise.all(
    USERS.map((user) => experiment("probe-cta", user)),
  );
  const repeated = await Promise.all(
    USERS.map((user) => experiment($experiments.probeCta, user)),
  );

  return {
    noDefault: defineFlag().default,
    untargeted,
    atZero,
    atHundred,
    atThirty,
    atThirtyStable: atThirty === atThirtyAgain,
    roleTargeted,
    green: variants.filter((variant) => variant === "green").length,
    variantsStable: variants.every((variant, index) => variant === repeated[index]),
    guestVariant: await experiment("probe-cta"),
    controlBeforeStart: beforeStart.every((variant) => variant === "control"),
  };
});
