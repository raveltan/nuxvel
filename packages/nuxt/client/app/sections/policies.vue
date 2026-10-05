<script setup lang="ts">
import type { PoliciesSectionData } from "../../../src/runtime/shared/devtools/sections/policies";

const props = defineProps<{ data: PoliciesSectionData }>();

const rows = computed(() =>
  props.data.map((policy) => [
    policy.table,
    policy.rules.map((rule) => (rule.allowsSystem ? `${rule.name} (system allowed)` : rule.name)).join(", "),
  ]),
);
</script>

<template>
  <SectionTable :headings="['Table', 'Rules']" :rows="rows" />
</template>
