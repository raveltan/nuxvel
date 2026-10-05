<script setup lang="ts">
import { useI18n, useNuxtApp, useToast } from "#imports";
import { UButton } from "#components";
import { watch } from "vue";

/**
 * An "Install app" button that shows while the browser offers to
 * install the app, and a toast with a "Reload" action once a new
 * version of the app is ready.
 *
 * Auto-registered as a component when `nuxvel.pwa` is set and
 * `nuxvel.ui` is not `false`. Keep `<UApp>` in `app.vue` for the toast.
 * Without Nuxt UI, build the same from `usePWA()` of `@vite-pwa/nuxt`.
 *
 * @example
 * ```vue
 * <PwaInstallPrompt />
 * ```
 */
defineOptions({ name: "PwaInstallPrompt" });

const { $pwa } = useNuxtApp();
const toast = useToast();
const { ts } = useI18n();

watch(
  () => $pwa?.needRefresh,
  (needRefresh) => {
    if (!needRefresh) return;

    toast.add({
      title: ts("nuxvel.pwaInstallPrompt.newVersion"),
      duration: 0,
      actions: [{ label: ts("nuxvel.pwaInstallPrompt.reload"), onClick: () => $pwa?.updateServiceWorker(true) }],
    });
  },
  { immediate: true },
);
</script>

<template>
  <UButton v-if="$pwa?.showInstallPrompt" icon="i-lucide-download" :label="$ts('nuxvel.pwaInstallPrompt.install')" @click="$pwa.install()" />
</template>
