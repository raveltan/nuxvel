<script setup lang="ts">
import type { TimelineEntry } from "../../../src/runtime/shared/devtools/collected-entry";
import type { EntrySummary, RequestsSectionData } from "../../../src/runtime/shared/devtools/sections/requests";

const props = defineProps<{ data: RequestsSectionData }>();

const entriesUrl = `${useRuntimeConfig().app.baseURL}api/entries/`;
const filter = ref("");
const openId = ref<string>();
const opened = ref<TimelineEntry>();
const openError = ref<string>();

const shown = computed(() => {
  const query = filter.value.trim();

  return query ? props.data.filter((entry) => entry.id.includes(query) || entry.label.includes(query)) : props.data;
});
const openOutsideList = computed(() => openId.value !== undefined && !shown.value.some((entry) => entry.id === openId.value));

function outcome(entry: EntrySummary) {
  if (entry.error) return "error";
  return entry.status === undefined ? "done" : String(entry.status);
}

async function open(id: string) {
  if (openId.value === id) {
    openId.value = undefined;
    return;
  }

  openId.value = id;
  opened.value = undefined;
  openError.value = undefined;

  const response = await fetch(`${entriesUrl}${encodeURIComponent(id)}`);

  if (openId.value !== id) return;
  if (response.ok) opened.value = await response.json();
  else openError.value = response.status === 404 ? `No entry ${id}: it has not finished, or it left the buffer.` : `Could not load ${id}: ${response.status}`;
}

onMounted(() => {
  const id = new URLSearchParams(window.location.search).get("entry");

  if (id) void open(id);
});
</script>

<template>
  <div class="flex flex-col gap2">
    <NTextInput v-model="filter" placeholder="Filter by id or label" icon="carbon-search" />
    <template v-if="openOutsideList">
      <EntryTimeline v-if="opened" :entry="opened" />
      <div v-else-if="openError" class="text-sm op75">
        {{ openError }}
      </div>
    </template>
    <table class="w-full text-sm">
      <thead>
        <tr>
          <th v-for="heading in ['Kind', 'Label', 'Actor', 'Status', 'Duration', 'Spans']" :key="heading" class="px2 py1 text-left font-normal op50">
            {{ heading }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="entry in shown" :key="entry.id">
          <tr :data-entry-id="entry.id" class="cursor-pointer border-t border-base hover:bg-active" @click="open(entry.id)">
            <td class="px2 py1">
              {{ entry.kind }}
            </td>
            <td class="px2 py1 font-mono">
              {{ entry.label }}
            </td>
            <td class="px2 py1 font-mono">
              {{ entry.actor ?? "" }}
            </td>
            <td class="px2 py1 font-mono" :class="{ 'text-red': entry.error || (entry.status ?? 0) >= 500 }">
              {{ outcome(entry) }}
            </td>
            <td class="px2 py1 font-mono">
              {{ entry.durationMs === undefined ? "" : `${entry.durationMs.toFixed(1)} ms` }}
            </td>
            <td class="px2 py1 font-mono">
              {{ entry.spanCount }}{{ entry.truncated ? "+" : "" }}
              <span v-if="entry.errors" data-entry-errors class="ml1 rounded px1 text-xs text-red bg-red:10">{{ entry.errors }} error{{ entry.errors === 1 ? "" : "s" }}</span>
              <span v-if="entry.warnings" data-entry-warnings class="ml1 rounded px1 text-xs text-orange bg-orange:10">{{ entry.warnings }} warning{{ entry.warnings === 1 ? "" : "s" }}</span>
            </td>
          </tr>
          <tr v-if="openId === entry.id">
            <td colspan="6" class="px2">
              <EntryTimeline v-if="opened" :entry="opened" />
              <div v-else-if="openError" class="py2 text-sm op75">
                {{ openError }}
              </div>
              <div v-else class="py2 op50">
                Loading…
              </div>
            </td>
          </tr>
        </template>
        <tr v-if="!shown.length">
          <td colspan="6" class="px2 py1 op50">
            None yet
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
