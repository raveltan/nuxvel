<script setup lang="ts">
import type { CatalogListener, EventsSectionData } from "../../../src/runtime/shared/devtools/sections/events";

const props = defineProps<{ data: EventsSectionData }>();

function listenerText(listener: CatalogListener) {
  const oldNames = listener.oldNames.length ? `, also ${listener.oldNames.join(", ")}` : "";

  return `${listener.name} (${listener.mode}${oldNames})`;
}

const rows = computed(() =>
  props.data.map((event) => [
    event.name,
    event.version,
    schemaText(event.payload),
    event.listeners.length ? event.listeners.map(listenerText).join(", ") : "nothing listens",
  ]),
);
</script>

<template>
  <SectionTable :headings="['Event', 'Version', 'Payload', 'Listeners']" :rows="rows" />
</template>
