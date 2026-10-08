<script setup lang="ts">
import { useUser } from "@nuxvel/nuxt/app/auth";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Role = NonNullable<ReturnType<typeof useUser>["user"]["value"]>["role"];

const roleIsString: IsAny<Role> extends true ? never : [Role] extends [string] ? true : never = true;
</script>

<template>
  <p>{{ roleIsString }}</p>
</template>
