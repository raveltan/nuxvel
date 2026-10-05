<script setup lang="ts">
import { useHead } from "#app";
import { useI18n } from "#imports";

/**
 * The page the app shows while it is in maintenance mode, with the
 * message of `nuxvel down`.
 *
 * Auto-registered as a component, in Nuxt UI markup (`UError`), or in
 * plain markup when the app sets `nuxvel.ui: false`. nuxvel renders it
 * for the maintenance 503 when the app has no `error.vue`. In your own
 * `error.vue`, render it when {@link isMaintenanceError} is true.
 *
 * @example
 * ```vue
 * <Maintenance v-if="isMaintenanceError(error)" :error="error" />
 * ```
 */
defineOptions({ name: "Maintenance" });

defineProps<{
  /** The error that `error.vue` receives. The page shows its `message`. */
  error: { message: string };
}>();

const { ts } = useI18n();

useHead({ title: () => ts("nuxvel.maintenance.title") });
</script>

<template>
  <main>
    <h1>{{ $t("nuxvel.maintenance.title") }}</h1>
    <p>{{ error.message }}</p>
  </main>
</template>
