<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const { status, progress, result, error } = useJobChannel("demo.countdown");
const countdown = $api.jobs.startCountdown.useMutation();

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
      <UButton label="Run countdown" :loading="countdown.isLoading" @click="countdown.mutate({ fail: false })" />
      <UButton
        color="error"
        variant="outline"
        label="Run failing countdown"
        :loading="countdown.isLoading"
        @click="countdown.mutate({ fail: true })"
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
        <UProgress :model-value="progress ?? 0" aria-label="Countdown progress" />
        <p v-if="error" class="text-sm text-error">
          {{ error }}
        </p>
        <p v-else-if="result" class="text-sm text-muted">
          Finished at <DateTime :value="result.finishedAt" :options="{ timeStyle: 'medium' }" />
        </p>
      </div>
    </UCard>
  </div>
</template>
