<script setup lang="ts">
import type { DateTime } from "#components";
import { useTimezone } from "@nuxvel/nuxt/app/ui";

type IsAny<T> = 0 extends 1 & T ? true : false;

const timezone = useTimezone();

type DateTimeValue = InstanceType<typeof DateTime>["$props"]["value"];

const timezoneIsString: IsAny<typeof timezone.value> extends true
  ? never
  : typeof timezone.value extends string
    ? true
    : never = true;
const valueIsTyped: IsAny<DateTimeValue> extends true
  ? never
  : [DateTimeValue] extends [Date | string | number]
    ? true
    : never = true;
</script>

<template>
  <p>{{ timezoneIsString }} {{ valueIsTyped }}</p>
</template>
