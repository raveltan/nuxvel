<script setup lang="ts">
import type { SectionResult, SectionSummary } from "../../../src/runtime/shared/devtools/section-stream";

const props = defineProps<{ summary: SectionSummary; result?: SectionResult }>();

const view = computed(() => sectionView(props.summary.id));
const status = computed(() => props.result?.status ?? "loading");
</script>

<template>
  <section :data-section="summary.id" :data-status="status">
    <NSectionBlock :text="summary.title">
      <div v-if="!result" class="op50">
        Loading…
      </div>
      <NTip v-else-if="result.status === 'failed'" n="red" icon="carbon-warning-alt">
        Could not load this section: {{ result.error }}
      </NTip>
      <component :is="view" v-else-if="view" :data="result.data" />
      <pre v-else class="text-sm">{{ JSON.stringify(result.data, null, 2) }}</pre>
    </NSectionBlock>
  </section>
</template>
