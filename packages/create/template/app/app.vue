<script setup lang="ts">
import { useUiLocale } from "@nuxvel/nuxt/app/ui";

const uiLocale = useUiLocale();
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtRouteAnnouncer />
    <NuxtAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
