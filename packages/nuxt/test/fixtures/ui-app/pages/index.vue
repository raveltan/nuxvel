<script setup lang="ts">
import { useQuery } from "@pinia/colada";

const loading = useQuery({ key: ["loading"], query: async () => [], enabled: false });
const failed = useQuery({
  key: ["failed"],
  query: async (): Promise<string[]> => {
    throw new Error("The list could not be loaded.");
  },
  retry: false,
  enabled: import.meta.client,
});
const empty = useQuery({ key: ["empty"], query: async (): Promise<string[]> => [] });
const loaded = useQuery({ key: ["loaded"], query: async () => ["First post"] });
</script>

<template>
  <UButton label="Save" />
  <UAlert color="error" title="Payment failed" description="Your card was declined." />
  <section aria-label="loading state"><QueryState :query="loading" /></section>
  <section aria-label="error state"><QueryState :query="failed" /></section>
  <section aria-label="empty state"><QueryState :query="empty" /></section>
  <section aria-label="loaded state">
    <QueryState :query="loaded">
      <template #default="{ data }">
        <p v-for="title in data" :key="title">{{ title }}</p>
      </template>
    </QueryState>
  </section>
</template>
