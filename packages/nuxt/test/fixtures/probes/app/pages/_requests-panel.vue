<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

const { data } = useQuery($api._requestsPanelCheck.load.queryOptions());
</script>

<template>
  <p class="requests-panel">
    {{ data }}
  </p>
</template>
