<script setup lang="ts">
import { useQuery } from "@pinia/colada";

const never = useQuery({ key: ["never"], query: async () => [], enabled: false });
</script>

<template>
  <QueryState :query="never" />
</template>
