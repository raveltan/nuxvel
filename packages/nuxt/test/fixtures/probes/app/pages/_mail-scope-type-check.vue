<script setup lang="ts">
import type { GlobalComponents } from "vue";

const mailComponentsStayOnTheServer: [Extract<keyof GlobalComponents, "EButton" | "MailLayout">] extends [never]
  ? true
  : never = true;
</script>

<template>
  <div>{{ mailComponentsStayOnTheServer }}</div>
</template>
