<script setup lang="ts">
const { data } = useQuery($api._requestsPanelCheck.load.queryOptions());
</script>

<template>
  <p class="requests-panel">
    {{ data }}
  </p>
</template>
