<script setup lang="ts">
const { data: requestId } = useQuery($api.health.requestId.queryOptions());
</script>

<template>
  <p class="request-id">request-id:{{ requestId }}</p>
</template>
