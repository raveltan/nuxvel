<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const { events } = useJobChannel("demo.countdown");
const { mutate: start, isLoading: starting } = useMutation(
  useTRPC().jobs.startCountdown.mutationOptions(),
);

const latest = computed(() => events.value.at(-1));
const status = computed(() => {
  if (!latest.value) return "idle";
  if (latest.value.event === "progress") return "running";
  return latest.value.event;
});
const percent = computed(() => {
  const progress = events.value.findLast((message) => message.event === "progress");
  return progress?.event === "progress" ? progress.payload.percent : 0;
});
const statusColor = computed(() =>
  ({ idle: "neutral", running: "info", completed: "success", failed: "error" } as const)[status.value],
);
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Jobs</h1>
    <p class="text-sm text-muted">
      Dispatches <code>demo.countdown</code> through the outbox; <code>nuxvel queue:work</code>
      runs it and reports on its job channel. A failing run is retried twice before it fails.
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton label="Run countdown" :loading="starting" @click="start({ fail: false })" />
      <UButton
        color="error"
        variant="outline"
        label="Run failing countdown"
        :loading="starting"
        @click="start({ fail: true })"
      />
    </div>
    <UCard>
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <h2 class="font-semibold">Latest run</h2>
          <p role="status">
            <UBadge data-run-status :color="statusColor" variant="outline" :label="status" />
          </p>
        </div>
        <UProgress :model-value="percent" aria-label="Countdown progress" />
        <p v-if="latest?.event === 'failed'" class="text-sm text-error">
          {{ latest.payload.message }}
        </p>
        <p v-else-if="latest?.event === 'completed'" class="text-sm text-muted">
          Finished at <DateTime :value="latest.payload.result.finishedAt" :options="{ timeStyle: 'medium' }" />
        </p>
      </div>
    </UCard>
  </div>
</template>
