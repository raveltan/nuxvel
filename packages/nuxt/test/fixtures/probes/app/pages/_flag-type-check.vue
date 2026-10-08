<script setup lang="ts">
import { useExperiment, useFlag } from "@nuxvel/nuxt/app/flags";

type IsAny<T> = 0 extends 1 & T ? true : false;

const rollout = useFlag("probe-rollout");
const stubbed = useFlag("probe-rollout");
// @ts-expect-error no flag is named probe-missing
useFlag("probe-missing");
const cta = useExperiment("probe-cta");
const stubbedCta = useExperiment("probe-cta");
// @ts-expect-error no experiment is named probe-missing
useExperiment("probe-missing");

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
const stubIsTyped: IsAny<FlagNameArg> extends true
  ? never
  : "probe-rollout" extends FlagNameArg
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
