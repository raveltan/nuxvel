<script setup lang="ts">
const trpc = useTRPC();
const { data } = useQuery(trpc._requestsPanelCheck.load.queryOptions());
</script>

<template>
  <p class="requests-panel">
    {{ data }}
  </p>
</template>
