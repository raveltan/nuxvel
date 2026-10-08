<script setup lang="ts">
import { $api, QueryState } from "@nuxvel/nuxt/app/api";

const route = useRoute();
const names = String(route.query.names).split(",") as ("ForbiddenError" | "UnauthenticatedError" | "NotFoundError" | "UnknownError")[];
const queries = names.map((name) => useQuery({ ...$api._taxonomyCheck.throwError.queryOptions(name) }));
</script>

<template>
  <div>
    <QueryState v-for="(query, index) in queries" :key="index" :query="query">
      <template #error="{ error }">
        <p>caught:{{ error.message }}</p>
      </template>
      <template #default>
        <p>no error</p>
      </template>
    </QueryState>
  </div>
</template>
