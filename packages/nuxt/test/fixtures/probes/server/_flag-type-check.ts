import { experiment, experimentReport, experimentState, flag, flagTargeting, setFlagTargeting, startExperiment, stopExperiment, track } from "@nuxvel/nuxt/server/flags";
import type { Flag } from "@nuxvel/nuxt/server/flags";
import * as testNamespaces from "#build/nuxvel/test-namespaces.mjs";
import { probeCtaExperiment } from "#server/flags/probe-cta.experiment";
import { probeRolloutFlag } from "#server/flags/probe-rollout.flag";

type IsAny<T> = 0 extends 1 & T ? true : false;

type FlagNameArg = Extract<Parameters<typeof flag>[0], string>;
const ctaVariant = () => experiment("probe-cta");
type CtaVariant = Awaited<ReturnType<typeof ctaVariant>>;

export const flagNameIsTyped: IsAny<FlagNameArg> extends true
  ? never
  : FlagNameArg extends "probe-rollout"
    ? true
    : never = true;
export const experimentVariantIsTyped: IsAny<CtaVariant> extends true
  ? never
  : [CtaVariant] extends ["control" | "green"]
    ? ["control" | "green"] extends [CtaVariant]
      ? true
      : never
    : never = true;

type TrackedMetric = Parameters<typeof track>[0];

export const trackMetricIsTyped: IsAny<TrackedMetric> extends true
  ? never
  : [TrackedMetric] extends ["probe.converted"]
    ? ["probe.converted"] extends [TrackedMetric]
      ? true
      : never
    : never = true;

export async function managesOnlyDefinedFlags() {
  await flagTargeting("probe-rollout");
  await setFlagTargeting("probe-rollout", { percentage: 10 });
  await experimentState("probe-cta");
  await experimentReport("probe-cta");

  // @ts-expect-error no flag is named probe-missing
  await flagTargeting("probe-missing");
  // @ts-expect-error probe-cta is an experiment, not a flag
  await setFlagTargeting("probe-cta", { percentage: 10 });
  // @ts-expect-error probe-rollout is a flag, not an experiment
  await experimentState("probe-rollout");
  // @ts-expect-error no experiment is named probe-missing
  await startExperiment("probe-missing");
  // @ts-expect-error no experiment is named probe-missing
  await stopExperiment("probe-missing");
  // @ts-expect-error no experiment is named probe-missing
  await experimentReport("probe-missing");
}

export async function takesADefinition() {
  const on: boolean = await flag(probeRolloutFlag);
  const variant: "control" | "green" = await experiment(probeCtaExperiment);

  await flagTargeting(probeRolloutFlag);
  await setFlagTargeting(probeRolloutFlag, { percentage: 10 });
  await experimentState(probeCtaExperiment);
  await startExperiment(probeCtaExperiment);
  await stopExperiment(probeCtaExperiment);

  // @ts-expect-error probe-cta is an experiment, not a flag
  await flag(probeCtaExperiment);
  // @ts-expect-error probe-cta is an experiment, not a flag
  await setFlagTargeting(probeCtaExperiment, { percentage: 10 });
  // @ts-expect-error probe-rollout is a flag, not an experiment
  await experiment(probeRolloutFlag);
  // @ts-expect-error probe-rollout is a flag, not an experiment
  await startExperiment(probeRolloutFlag);
  // @ts-expect-error the variant of probe-cta is control or green
  const blue: "blue" = await experiment(probeCtaExperiment);

  return { on, variant, blue };
}

type NamespacedFlag = typeof testNamespaces.$flags.probeRollout;
type NamespacedExperiment = typeof testNamespaces.$experiments.probeCta;

export const flagsNamespaceIsTyped: IsAny<NamespacedFlag> extends true ? never : NamespacedFlag extends Flag ? true : never = true;
export const experimentsNamespaceIsTyped: IsAny<NamespacedExperiment> extends true
  ? never
  : NamespacedExperiment extends { kind: "experiment" }
    ? true
    : never = true;
// @ts-expect-error an experiment is in $experiments, not in $flags
export const experimentIsNotAFlag = testNamespaces.$flags.probeCta;
