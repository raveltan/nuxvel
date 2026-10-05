<script setup lang="ts">
const trpc = useTRPC();
const { data: requestId } = useQuery(trpc.health.requestId.queryOptions());
</script>

<template>
  <p class="request-id">request-id:{{ requestId }}</p>
</template>
