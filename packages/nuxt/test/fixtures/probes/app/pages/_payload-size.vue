<script setup lang="ts">
const { data } = useQuery($api._payloadCheck.large.queryOptions());
</script>

<template>
  <p>{{ data?.length }}</p>
</template>
