<script setup lang="ts">
import type { DefinitionsSectionData } from "../../../src/runtime/shared/devtools/sections/definitions";

const props = defineProps<{ data: DefinitionsSectionData }>();

const mailRows = computed(() => props.data.mails.map((mail) => [mail.name, schemaText(mail.input)]));

const backfillRows = computed(() =>
  props.data.backfills.map((backfill) => [
    backfill.name,
    backfill.table,
    backfill.total === null ? "not run yet" : `${backfill.processed}/${backfill.total}${backfill.completed ? ", done" : ""}`,
    backfill.storedAs,
  ]),
);

const rateLimitRows = computed(() =>
  props.data.rateLimits.map((limit) => [limit.name, `${limit.points} per ${limit.seconds} s`]),
);
</script>

<template>
  <div class="flex flex-col gap4">
    <SectionTable :headings="['Mail', 'Input']" :rows="mailRows" />
    <SectionTable :headings="['Backfill', 'Table', 'Progress', 'Stored as']" :rows="backfillRows" />
    <SectionTable :headings="['Rate limit', 'Allows']" :rows="rateLimitRows" />
  </div>
</template>
