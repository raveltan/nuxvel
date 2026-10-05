<script setup lang="ts">
const route = useRoute();
const name = route.query.name === "UnknownError" ? "UnknownError" : "NotFoundError";
const trpc = useTRPC();
const failing = useQuery({ ...trpc._taxonomyCheck.throwError.queryOptions(name) });
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
