<script setup lang="ts">
import { isMaintenanceError, useMaintenance } from "@nuxvel/nuxt/app/maintenance";

type IsAny<T> = 0 extends 1 & T ? true : false;

const maintenance = useMaintenance();

const downIsBoolean: IsAny<typeof maintenance.value.down> extends true
  ? never
  : typeof maintenance.value.down extends boolean
    ? true
    : never = true;
const messageIsTyped: IsAny<typeof maintenance.value.message> extends true
  ? never
  : [typeof maintenance.value.message] extends [string | null]
    ? true
    : never = true;
const errorCheckIsTyped: IsAny<ReturnType<typeof isMaintenanceError>> extends true ? never : true = true;
</script>

<template>
  <p>{{ downIsBoolean }} {{ messageIsTyped }} {{ errorCheckIsTyped }}</p>
</template>
