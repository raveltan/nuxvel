<script setup lang="ts">
const trpc = useTRPC();
const { data } = useQuery(trpc._payloadCheck.large.queryOptions());
</script>

<template>
  <p>{{ data?.length }}</p>
</template>
