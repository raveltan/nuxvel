<script setup lang="ts">
const flashes = useFlash();
</script>

<template>
  <p v-for="flash in flashes" :key="flash.message" role="status">{{ flash.type }}: {{ flash.message }}</p>
</template>
