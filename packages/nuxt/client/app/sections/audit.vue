<script setup lang="ts">
import type { AuditSectionData } from "../../../src/runtime/shared/devtools/sections/audit";

const props = defineProps<{ data: AuditSectionData }>();

const rows = computed(() =>
  props.data.map((entry) => [
    entry.id,
    entry.occurredAt,
    `${entry.actorType}:${entry.actorId}`,
    entry.action,
    `${entry.targetType}:${entry.targetId}`,
  ]),
);
</script>

<template>
  <SectionTable :headings="['Id', 'When', 'Actor', 'Action', 'Target']" :rows="rows" />
</template>
