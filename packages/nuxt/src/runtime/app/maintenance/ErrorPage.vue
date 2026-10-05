<script setup lang="ts">
import type { NuxtError } from "#app";
import NuxtErrorPage from "#app/components/nuxt-error-page.vue";
import { Maintenance } from "#components";
import { isMaintenanceError } from "./is-maintenance-error";

defineProps<{ error: NuxtError }>();
</script>

<template>
  <Maintenance v-if="isMaintenanceError(error)" :error="error" />
  <NuxtErrorPage v-else :error="error" />
</template>
