<script setup lang="ts">
import { useExperiment, useFlag } from "@nuxvel/nuxt/app/flags";

const rollout = useFlag("probe-rollout");
const cta = useExperiment("probe-cta");
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Flags</h1>
    <p class="text-sm text-muted">
      Evaluated on the server for you, and live: change targeting with
      <code>nuxvel flag:set</code> and this page follows without a reload.
      An experiment that is not running shows everyone its control variant.
    </p>
    <UCard>
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="font-medium">probe-rollout</dt>
        <dd data-flag="probe-rollout">{{ rollout ? "on" : "off" }}</dd>
        <dt class="font-medium">probe-cta</dt>
        <dd data-flag="probe-cta">{{ cta ?? "unavailable" }}</dd>
      </dl>
    </UCard>
    <UButton
      v-if="rollout"
      color="success"
      icon="i-lucide-sparkles"
      label="Try the new flow"
    />
    <UButton v-else color="neutral" variant="outline" label="Use the classic flow" />
  </div>
</template>
