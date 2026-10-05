<script setup lang="ts">
import type { ChannelsSectionData } from "../../../src/runtime/shared/devtools/sections/channels";

const props = defineProps<{ data: ChannelsSectionData }>();

const rows = computed(() =>
  props.data.map((channel) => [channel.name, channel.events.join(", "), channel.connections]),
);
</script>

<template>
  <SectionTable :headings="['Channel', 'Events', 'Open connections']" :rows="rows" />
</template>
