<script setup lang="ts">
import type { TimelineEntry } from "../../../src/runtime/shared/devtools/collected-entry";

const props = defineProps<{ entry: TimelineEntry }>();

const span = computed(() => Math.max(props.entry.durationMs ?? 0, ...props.entry.spans.map((item) => item.atMs), 1));

function offsetPercent(atMs: number) {
  return `${Math.min(100, (atMs / span.value) * 100)}%`;
}
</script>

<template>
  <div :data-entry-detail="entry.id" class="flex flex-col gap2 py2">
    <div class="flex flex-wrap gap2 text-sm">
      <NBadge>{{ entry.kind }}</NBadge>
      <span class="font-mono">{{ entry.id }}</span>
      <span v-if="entry.actor" class="op75">actor {{ entry.actor }}</span>
      <span class="op75">started {{ new Date(entry.startedAt).toISOString() }}</span>
    </div>
    <NTip v-if="entry.error" n="red" icon="carbon-warning-alt">
      {{ entry.error }}
    </NTip>
    <table class="w-full text-sm">
      <thead>
        <tr>
          <th class="w-24 px2 py1 text-right font-normal op50">
            Offset
          </th>
          <th class="w-32 px2 py1 text-left font-normal op50">
            Type
          </th>
          <th class="px2 py1 text-left font-normal op50">
            What
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in entry.spans" :key="index" :data-span-type="item.type" class="border-t border-base">
          <td class="px2 py1 text-right font-mono">
            +{{ item.atMs.toFixed(1) }} ms
            <div class="relative h1 bg-gray/10">
              <div class="absolute h1 w1 bg-primary" :style="{ left: offsetPercent(item.atMs) }" />
            </div>
          </td>
          <td class="px2 py1 font-mono">
            {{ item.type }}
          </td>
          <td class="px2 py1">
            <details>
              <summary class="cursor-pointer font-mono break-all">
                {{ item.summary }}
              </summary>
              <pre class="text-xs">{{ JSON.stringify(item.data, null, 2) }}</pre>
              <div v-if="item.truncated" class="text-xs op50">
                Cut at 16 KB.
              </div>
            </details>
          </td>
        </tr>
        <tr v-if="!entry.spans.length">
          <td colspan="3" class="px2 py1 op50">
            Nothing observed
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="entry.truncated" class="text-sm op50">
      Later spans were dropped: an entry keeps at most 1,000.
    </div>
  </div>
</template>
