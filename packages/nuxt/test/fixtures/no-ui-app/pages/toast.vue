<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

$api.post.create.useMutation({ toast: "Saved" });
</script>

<template>
  <p>toast</p>
</template>
