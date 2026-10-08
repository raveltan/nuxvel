<script setup lang="ts">
import { useFlash } from "../../../../src/runtime/app/composables/use-flash";

const flashes = useFlash();
</script>

<template>
  <p v-for="flash in flashes" :key="flash.message" role="status">{{ flash.type }}: {{ flash.message }}</p>
</template>
