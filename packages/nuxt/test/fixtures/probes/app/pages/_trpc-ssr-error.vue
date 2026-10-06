<script setup lang="ts">
const failing = useQuery({ ...$api._taxonomyCheck.throwError.queryOptions("NotFoundError"), ssrCatchError: true });
</script>

<template>
  <QueryState :query="failing">
    <template #error="{ error }">
      <p>caught:{{ error.message }}</p>
    </template>
    <template #default>
      <p>no error</p>
    </template>
  </QueryState>
</template>
