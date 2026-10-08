<script setup lang="ts">
import { $api, QueryState } from "@nuxvel/nuxt/app/api";

const route = useRoute();
const name = route.query.name === "UnknownError" ? "UnknownError" : "NotFoundError";
const failing = useQuery({ ...$api._taxonomyCheck.throwError.queryOptions(name) });
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
