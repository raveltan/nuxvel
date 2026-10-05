<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "#imports";
import { UButton } from "#components";

const props = defineProps<{ label: string; direction?: "asc" | "desc"; position?: number }>();

const emit = defineEmits<{ sort: [event: MouseEvent] }>();

const { ts } = useI18n();

const ariaLabel = computed(() =>
  props.direction === "asc"
    ? ts("nuxvel.dataTableSortButton.ascending", { label: props.label })
    : props.direction === "desc"
      ? ts("nuxvel.dataTableSortButton.descending", { label: props.label })
      : ts("nuxvel.dataTableSortButton.sortBy", { label: props.label }),
);
const icon = computed(() =>
  props.direction === "asc" ? "i-lucide-arrow-up" : props.direction === "desc" ? "i-lucide-arrow-down" : "i-lucide-arrow-up-down",
);
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    class="-mx-2.5"
    :label="position ? `${label} (${position})` : label"
    :trailing-icon="icon"
    :aria-label="ariaLabel"
    :title="$ts('nuxvel.dataTableSortButton.hint')"
    @click="emit('sort', $event)"
  />
</template>
