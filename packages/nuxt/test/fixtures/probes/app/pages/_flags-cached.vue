<script setup lang="ts">
import { useExperiment, useFlag } from "@nuxvel/nuxt/app/flags";

const rollout = useFlag("probe-rollout");
const cta = useExperiment("probe-cta");
</script>

<template>
  <p class="flags">probe-rollout:{{ rollout }} probe-cta:{{ cta }}</p>
</template>
