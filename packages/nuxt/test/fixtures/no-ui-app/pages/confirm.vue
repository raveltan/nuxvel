<script setup lang="ts">
$api.post.delete.useMutation({ confirm: { title: "Delete?" } });
</script>

<template>
  <p>confirm</p>
</template>
