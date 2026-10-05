<script setup lang="ts">
import type { SqlEntry, SqlQuery, SqlSectionData } from "../../../src/runtime/shared/devtools/sections/sql";

type Explained = { running: boolean; plan?: string; error?: string };

const props = defineProps<{ data: SqlSectionData }>();

const explainUrl = `${useRuntimeConfig().app.baseURL}api/explain`;
const selectedId = ref<string>();
const explained = reactive<Record<string, Explained>>({});

const selected = computed(() => props.data.find((entry) => entry.id === selectedId.value) ?? props.data[0]);

function totalMs(entry: SqlEntry) {
  return entry.queries.reduce((total, query) => total + query.durationMs, 0).toFixed(1);
}

function explainKey(entry: SqlEntry, query: SqlQuery) {
  return `${entry.id}:${query.index}`;
}

async function explain(entry: SqlEntry, query: SqlQuery) {
  const key = explainKey(entry, query);

  explained[key] = { running: true };

  try {
    const response = await fetch(explainUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: entry.id, index: query.index }),
    });
    const body = await response.json();

    explained[key] = response.ok
      ? { running: false, plan: body.plan }
      : { running: false, error: body.statusMessage ?? body.message ?? response.statusText };
  } catch (error) {
    explained[key] = { running: false, error: String(error) };
  }
}
</script>

<template>
  <div v-if="!data.length" class="op50">
    No queries yet
  </div>
  <div v-else class="flex flex-col gap3">
    <div class="flex flex-wrap gap2">
      <NButton
        v-for="entry in data"
        :key="entry.id"
        :n="entry.id === selected?.id ? 'primary' : undefined"
        :data-entry="entry.id"
        @click="selectedId = entry.id"
      >
        {{ entry.label }} · {{ entry.queries.length }} · {{ totalMs(entry) }} ms
        <NBadge v-if="entry.queries.some((query) => query.suspected)" n="orange">
          N+1
        </NBadge>
      </NButton>
    </div>
    <table v-if="selected" class="w-full text-sm">
      <thead>
        <tr>
          <th class="px2 py1 text-left font-normal op50">
            SQL
          </th>
          <th class="px2 py1 text-right font-normal op50">
            ms
          </th>
          <th class="px2 py1 text-right font-normal op50">
            Repeats
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <template v-for="query in selected.queries" :key="query.index">
          <tr class="border-t border-base" :class="{ 'bg-orange/10': query.suspected }" :data-suspected="query.suspected">
            <td class="px2 py1 font-mono break-all">
              {{ query.sql }}
              <div v-if="query.params.length" class="op50">
                {{ JSON.stringify(query.params) }}
              </div>
              <div v-if="query.repeatReason" class="op50">
                allowed: {{ query.repeatReason }}
              </div>
            </td>
            <td class="px2 py1 text-right font-mono">
              {{ query.durationMs.toFixed(1) }}
            </td>
            <td class="px2 py1 text-right font-mono" :class="{ 'text-orange': query.suspected }">
              {{ query.repeated > 1 ? `${query.repeated} ×` : "" }}
            </td>
            <td class="px2 py1 text-right">
              <NButton @click="explain(selected, query)">
                EXPLAIN
              </NButton>
            </td>
          </tr>
          <tr v-if="explained[explainKey(selected, query)]" :data-explained="query.index">
            <td colspan="4" class="px2 py1">
              <span v-if="explained[explainKey(selected, query)]?.running" class="op50">Running…</span>
              <NTip v-else-if="explained[explainKey(selected, query)]?.error" n="red" icon="carbon-warning-alt">
                {{ explained[explainKey(selected, query)]?.error }}
              </NTip>
              <pre v-else class="text-xs">{{ explained[explainKey(selected, query)]?.plan }}</pre>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
