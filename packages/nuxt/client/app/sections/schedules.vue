<script setup lang="ts">
import type { SchedulesSectionData } from "../../../src/runtime/shared/devtools/sections/schedules";

const props = defineProps<{ data: SchedulesSectionData }>();

const rows = computed(() =>
  props.data.map((schedule) => [
    schedule.name,
    schedule.description,
    schedule.pattern,
    schedule.nextRun ?? "not registered, run queue:work",
    schedule.storedAs,
  ]),
);
</script>

<template>
  <SectionTable :headings="['Schedule', 'When', 'Pattern', 'Next run', 'Stored as']" :rows="rows" />
</template>
