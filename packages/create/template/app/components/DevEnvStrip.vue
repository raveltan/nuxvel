<script setup lang="ts">
type Health = { database?: string; redis?: string };

const { data: versions } = await useAsyncData("dev-versions", async () => {
  if (!import.meta.server) return null;
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@nuxvel/nuxt/package.json"), "utf8"));
  return { nuxvel: pkg.version as string, node: process.versions.node };
});
const nuxtVersion = useNuxtApp().versions.nuxt;

const health = ref<Health | null>(null);
onMounted(async () => {
  const response = await $fetch.raw<Health>("/api/health/ready", { ignoreResponseError: true }).catch(() => null);
  health.value = response?._data ?? {};
});

const services = computed(() => [
  { name: "Postgres", state: health.value ? health.value.database : undefined },
  { name: "Redis", state: health.value ? health.value.redis : undefined },
]);
</script>

<template>
  <footer class="border-t border-default bg-elevated/50">
    <UContainer class="flex flex-col gap-2 py-3 font-mono text-xs text-muted sm:h-13 sm:flex-row sm:items-center sm:justify-between sm:py-0">
      <p class="flex flex-wrap gap-x-4">
        <span>nuxvel <b class="font-medium text-muted">{{ versions?.nuxvel }}</b></span>
        <span>Nuxt <b class="font-medium text-muted">{{ nuxtVersion }}</b></span>
        <span>Node <b class="font-medium text-muted">{{ versions?.node }}</b></span>
        <span>env <b class="font-medium text-muted">development</b></span>
      </p>
      <p class="flex gap-4" aria-live="polite">
        <span v-for="service in services" :key="service.name" class="flex items-center gap-1.5">
          <span
            class="size-2 rounded-full"
            :class="service.state === 'reachable' ? 'bg-emerald-600' : service.state ? 'bg-red-600' : 'bg-stone-400'"
            aria-hidden="true"
          />
          {{ service.name }}
          <span class="sr-only">{{ $t(service.state === "reachable" ? "dev.reachable" : service.state ? "dev.unreachable" : "dev.checking") }}</span>
        </span>
      </p>
    </UContainer>
  </footer>
</template>
