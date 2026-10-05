<script setup lang="ts">
function explode() {
  throw new Error("click handler exploded");
}
</script>

<template>
  <button type="button" @click="explode">Explode</button>
</template>
