<script setup lang="ts">
import type { NuxtError } from "#app";
import { Maintenance, isMaintenanceError } from "@nuxvel/nuxt/app/maintenance";
import { useUiLocale } from "@nuxvel/nuxt/app/ui";

const props = defineProps<{ error: NuxtError }>();

const { ts } = useI18n();
const uiLocale = useUiLocale();
const requestId = useState("error-request-id", () => useRequestHeader("x-request-id"));
const title = computed(() => (props.error.statusCode === 404 ? ts("error.notFound") : ts("error.failed")));

const detail = computed(() => props.error.message.replace(/^Page not found:?\s*/, ""));

useSeoMeta({ title });
</script>

<template>
  <Maintenance v-if="isMaintenanceError(error)" :error="error" />
  <UApp v-else :locale="uiLocale">
    <main class="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <AppLogo />
      <div class="max-w-lg space-y-4 text-center">
        <p class="text-8xl font-bold tracking-tighter text-primary">{{ error.statusCode }}</p>
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="detail" class="text-muted">{{ detail }}</p>
        <p v-if="requestId" class="font-mono text-xs text-muted">{{ $t("error.requestId", { id: requestId }) }}</p>
        <UButton :label="$ts('error.goHome')" @click="clearError({ redirect: '/' })" />
      </div>
    </main>
  </UApp>
</template>
