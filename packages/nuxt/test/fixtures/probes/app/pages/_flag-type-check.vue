<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const rollout = useFlag("probe-rollout");
const stubbed = useFlag($flags.probeRollout);
const cta = useExperiment("probe-cta");
const stubbedCta = useExperiment($experiments.probeCta);

type FlagNameArg = Parameters<typeof useFlag>[0];

const flagNameIsTyped: IsAny<FlagNameArg> extends true
  ? never
  : Exclude<FlagNameArg, object> extends "probe-rollout"
    ? true
    : never = true;
const flagValueIsBoolean: IsAny<typeof rollout.value> extends true
  ? never
  : typeof rollout.value extends boolean
    ? true
    : never = true;
const stubIsTyped: IsAny<typeof $flags.probeRollout> extends true
  ? never
  : typeof $flags.probeRollout extends FlagNameArg
    ? true
    : never = true;
const variantIsTyped: IsAny<typeof cta.value> extends true
  ? never
  : [typeof cta.value] extends ["control" | "green" | undefined]
    ? ["control" | "green" | undefined] extends [typeof cta.value]
      ? true
      : never
    : never = true;
const stubbedVariantIsTyped: IsAny<typeof stubbedCta.value> extends true
  ? never
  : [typeof stubbedCta.value] extends ["control" | "green" | undefined]
    ? ["control" | "green" | undefined] extends [typeof stubbedCta.value]
      ? true
      : never
    : never = true;
</script>

<template>
  <p>{{ flagNameIsTyped }} {{ flagValueIsBoolean }} {{ stubIsTyped }} {{ stubbed }} {{ variantIsTyped }} {{ stubbedVariantIsTyped }}</p>
</template>
