<script setup lang="ts">
import type { JobsSectionData } from "../../../src/runtime/shared/devtools/sections/jobs";

const props = defineProps<{ data: JobsSectionData }>();

const rows = computed(() =>
  props.data.jobs.map((job) => [
    job.queue,
    job.id,
    job.name,
    job.state,
    job.attemptsMade,
    job.queuedAt,
    job.delay ? `${job.delay} ms` : "",
    job.priority || "",
    job.failedReason,
  ]),
);
</script>

<template>
  <div class="flex flex-wrap gap2">
    <NBadge v-for="(count, state) in data.counts" :key="state">
      {{ state }} {{ count }}
    </NBadge>
  </div>
  <SectionTable :headings="['Queue', 'Id', 'Name', 'State', 'Attempts', 'Queued at', 'Delay', 'Priority', 'Failure']" :rows="rows" />
</template>
