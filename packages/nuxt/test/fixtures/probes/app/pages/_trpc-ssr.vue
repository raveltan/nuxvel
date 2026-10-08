<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

const { data: requestId } = useQuery($api.health.requestId.queryOptions());
</script>

<template>
  <p class="request-id">request-id:{{ requestId }}</p>
</template>
