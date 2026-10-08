<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

const { data } = useQuery($api._payloadCheck.large.queryOptions());
</script>

<template>
  <p>{{ data?.length }}</p>
</template>
