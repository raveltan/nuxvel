<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

if (import.meta.client) inject("browser-problems-probe-missing");

function explode() {
  throw new Error("browser probe click exploded");
}

function reject() {
  void Promise.reject(new Error("browser probe rejection"));
}

async function failCall() {
  await $api._errorLeakCheck.unknown.query().catch(() => {});
}
</script>

<template>
  <div>
    <button type="button" @click="explode">Explode</button>
    <button type="button" @click="reject">Reject</button>
    <button type="button" @click="failCall">Fail call</button>
    <NuxtLink :to="{ name: '_browser-problems', query: { next: null } }">Leave</NuxtLink>
  </div>
</template>
