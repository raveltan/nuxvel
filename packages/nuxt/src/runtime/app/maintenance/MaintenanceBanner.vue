<script setup lang="ts">
import { reloadNuxtApp } from "#app";
import { UBanner } from "#components";
import { ref, watch } from "vue";
import { useMaintenance } from "../composables/use-maintenance";

/**
 * A Nuxt UI banner that tells the open tab when the app goes down for
 * maintenance, with the message of `nuxvel down`, and when it is back,
 * with a button to reload.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. Put it once in `app.vue` or a layout. It updates live from
 * {@link useMaintenance}, with no reload, and renders nothing while the
 * app is up.
 *
 * @example
 * ```vue
 * <UApp>
 *   <MaintenanceBanner />
 *   <NuxtLayout><NuxtPage /></NuxtLayout>
 * </UApp>
 * ```
 */
defineOptions({ name: "MaintenanceBanner" });

const maintenance = useMaintenance();
const back = ref(false);

watch(
  () => maintenance.value.down,
  (down) => {
    back.value = !down;
  },
);
</script>

<template>
  <UBanner
    v-if="maintenance.down"
    role="status"
    color="warning"
    icon="i-lucide-wrench"
    :title="maintenance.message ?? ''"
  />
  <UBanner
    v-else-if="back"
    role="status"
    color="success"
    icon="i-lucide-circle-check"
    :title="$ts('nuxvel.maintenanceBanner.back')"
    :actions="[{ label: $ts('nuxvel.maintenanceBanner.reload'), onClick: () => reloadNuxtApp() }]"
  />
</template>
