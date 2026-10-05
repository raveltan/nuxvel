<script setup lang="ts">
import { computed, onScopeDispose, reactive, watch } from "vue";
import { useI18n } from "#imports";
import { UButton, UFormField, UInput, USelect, USelectMenu } from "#components";
import type { DateRange, ListFilterKind } from "../../shared/pagination/list-query";

type FilterValue = string | boolean | string[] | DateRange;

const props = defineProps<{
  filters: Record<string, ListFilterKind>;
  value: Record<string, FilterValue | undefined>;
  labels: Record<string, string>;
}>();

const emit = defineEmits<{ update: [key: string, value: FilterValue | undefined]; clear: [] }>();

const { ts } = useI18n();

const booleanItems = computed(() => [
  { label: ts("nuxvel.dataTableFilters.yes"), value: "true" },
  { label: ts("nuxvel.dataTableFilters.no"), value: "false" },
]);

const texts = reactive<Record<string, string>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();

for (const [key, kind] of Object.entries(props.filters)) {
  if (kind !== "text") continue;

  watch(
    () => props.value[key],
    (value) => {
      const text = typeof value === "string" ? value : "";
      if (text !== (texts[key] ?? "").trim()) texts[key] = text;
    },
    { immediate: true },
  );
}

function commitText(key: string) {
  clearTimeout(timers.get(key));
  emit("update", key, texts[key]?.trim() || undefined);
}

function typeText(key: string, text: string) {
  texts[key] = text;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => commitText(key), 300));
}

onScopeDispose(() => timers.forEach((timer) => clearTimeout(timer)));

function booleanValue(key: string) {
  const value = props.value[key];
  return typeof value === "boolean" ? String(value) : undefined;
}

function selectValue(key: string) {
  const value = props.value[key];
  return Array.isArray(value) ? value : [];
}

function rangeValue(key: string): DateRange {
  const value = props.value[key];
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function setRange(key: string, end: keyof DateRange, date: string) {
  const range = { ...rangeValue(key), [end]: date || undefined };
  emit("update", key, range.from || range.to ? range : undefined);
}

function describe(value: FilterValue) {
  if (typeof value === "boolean") return ts(value ? "nuxvel.dataTableFilters.yes" : "nuxvel.dataTableFilters.no");
  if (typeof value === "string") return ts("nuxvel.dataTableFilters.quoted", { value });
  if (Array.isArray(value)) return value.join(", ");
  return ts("nuxvel.dataTableFilters.range", { from: value.from ?? "…", to: value.to ?? "…" });
}

const chips = computed(() =>
  Object.keys(props.filters).flatMap((key) => {
    const value = props.value[key];
    return value === undefined ? [] : [{ key, label: ts("nuxvel.dataTableFilters.chip", { label: props.labels[key] ?? key, value: describe(value) }) }];
  }),
);
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-end gap-3">
      <template v-for="(kind, key) in filters" :key="key">
        <UFormField v-if="kind === 'text'" :label="labels[key] ?? key">
          <UInput
            :model-value="texts[key] ?? ''"
            @update:model-value="typeText(key, String($event))"
            @keydown.enter="commitText(key)"
          />
        </UFormField>
        <UFormField v-else-if="kind === 'boolean'" :label="labels[key] ?? key">
          <USelect
            :model-value="booleanValue(key)"
            :items="booleanItems"
            :placeholder="$ts('nuxvel.dataTableFilters.any')"
            class="w-28"
            @update:model-value="emit('update', key, $event === 'true')"
          />
        </UFormField>
        <template v-else-if="kind === 'dateRange'">
          <UFormField :label="$ts('nuxvel.dataTableFilters.from', { label: labels[key] ?? key })">
            <UInput type="date" :model-value="rangeValue(key).from ?? ''" @update:model-value="setRange(key, 'from', String($event))" />
          </UFormField>
          <UFormField :label="$ts('nuxvel.dataTableFilters.to', { label: labels[key] ?? key })">
            <UInput type="date" :model-value="rangeValue(key).to ?? ''" @update:model-value="setRange(key, 'to', String($event))" />
          </UFormField>
        </template>
        <UFormField v-else :label="labels[key] ?? key">
          <USelectMenu
            multiple
            :model-value="selectValue(key)"
            :items="[...kind]"
            :placeholder="$ts('nuxvel.dataTableFilters.any')"
            class="w-40"
            @update:model-value="emit('update', key, $event.length > 0 ? $event : undefined)"
          />
        </UFormField>
      </template>
    </div>
    <div v-if="chips.length > 0" class="flex flex-wrap items-center gap-2">
      <UButton
        v-for="chip in chips"
        :key="chip.key"
        size="xs"
        color="neutral"
        variant="subtle"
        trailing-icon="i-lucide-x"
        :label="chip.label"
        :aria-label="$ts('nuxvel.dataTableFilters.remove', { filter: chip.label })"
        @click="emit('update', chip.key, undefined)"
      />
      <UButton size="xs" color="neutral" variant="link" :label="$ts('nuxvel.dataTableFilters.clearAll')" @click="emit('clear')" />
    </div>
  </div>
</template>
