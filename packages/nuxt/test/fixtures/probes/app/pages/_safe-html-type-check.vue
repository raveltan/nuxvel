<script setup lang="ts">
import { SafeHtml } from "@nuxvel/nuxt/app/ui";
</script>

<template>
  <section v-if="false">
    <!-- @vue-expect-error a plain string is not SanitizedHtml -->
    <SafeHtml html="<b>raw</b>" />
  </section>
</template>
