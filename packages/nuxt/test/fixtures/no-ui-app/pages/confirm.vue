<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

$api.post.delete.useMutation({ confirm: { title: "Delete?" } });
</script>

<template>
  <p>confirm</p>
</template>
