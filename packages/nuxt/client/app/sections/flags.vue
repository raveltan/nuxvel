<script setup lang="ts">
import type { FlagTargeting, FlagsSectionData } from "../../../src/runtime/shared/devtools/sections/flags";

const props = defineProps<{ data: FlagsSectionData }>();

function targetingText(targeting: FlagTargeting) {
  const parts = [
    targeting.percentage === undefined ? undefined : `${targeting.percentage}%`,
    ...Object.entries(targeting.roles ?? {}).map(([role, value]) => `role ${role}=${value}`),
  ].filter((part) => part !== undefined);

  return parts.length ? parts.join(", ") : "untargeted";
}

const rows = computed(() =>
  props.data.map((definition) =>
    definition.kind === "flag"
      ? [
          definition.name,
          "flag",
          `default ${definition.default}${definition.expiresAt ? `, expires ${definition.expiresAt}` : ""}`,
          targetingText(definition.targeting),
          definition.storedAs,
        ]
      : [
          definition.name,
          "experiment",
          Object.entries(definition.variants)
            .map(([variant, weight]) => `${variant}:${weight}`)
            .join(" "),
          definition.status,
          definition.storedAs,
        ],
  ),
);
</script>

<template>
  <SectionTable :headings="['Name', 'Kind', 'Definition', 'State', 'Stored as']" :rows="rows" />
</template>
