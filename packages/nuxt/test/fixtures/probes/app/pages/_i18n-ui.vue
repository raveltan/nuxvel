<script setup lang="ts">
import { DateTime } from "@nuxvel/nuxt/app/ui";
</script>

<template>
  <main>
    <DateTime value="2026-01-02T12:00:00Z" :options="{ dateStyle: 'long' }" />
    <UAlert title="Notice" close />
  </main>
</template>
