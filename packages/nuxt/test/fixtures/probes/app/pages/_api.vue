<script setup lang="ts">
const { data: requestId } = useQuery(() => $api.health.requestId.queryOptions());
const now = $api.health.now.useQuery();
</script>

<template>
  <p>api-request-id:{{ requestId }}</p>
  <p>api-use-query:{{ now.data?.at instanceof Date }}</p>
  <p>api-key:{{ $api.post.byId.key({ id: 7 }).slice(0, 3).join(".") }}</p>
</template>
