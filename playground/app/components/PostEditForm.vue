<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";
import type { RouterOutputs } from "@nuxvel/nuxt/app/api";
import { ActionForm } from "@nuxvel/nuxt/app/forms";

defineProps<{ post: RouterOutputs["post"]["byId"] }>();
</script>

<template>
  <ActionForm
    :action="$api.post.update"
    :defaults="post"
    hidden="id"
    submit-label="Save post"
    :options="{ toast: 'Post saved', onSuccess: () => navigateTo({ name: 'posts' }) }"
  />
</template>
