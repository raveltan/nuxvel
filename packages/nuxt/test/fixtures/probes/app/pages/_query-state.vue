<script setup lang="ts">
import { useQuery } from "@pinia/colada";
import { QueryState } from "@nuxvel/nuxt/app/api";

const never = useQuery({ key: ["never"], query: async () => [], enabled: false });
</script>

<template>
  <QueryState :query="never" />
</template>
