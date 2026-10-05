<script setup lang="ts">
import type { ProceduresSectionData } from "../../../src/runtime/shared/devtools/sections/procedures";

const props = defineProps<{ data: ProceduresSectionData }>();

const rows = computed(() =>
  props.data.map((procedure) => [procedure.path, procedure.type, schemaText(procedure.input)]),
);
</script>

<template>
  <SectionTable :headings="['Path', 'Type', 'Input']" :rows="rows" />
</template>
