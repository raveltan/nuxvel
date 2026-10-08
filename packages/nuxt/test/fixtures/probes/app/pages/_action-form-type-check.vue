<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";
import { ActionForm } from "@nuxvel/nuxt/app/forms";

type IsAny<T> = 0 extends 1 & T ? true : false;

function notAny<T>(value: IsAny<T> extends true ? never : T) {
  return value;
}

function isString(value: string) {
  return value;
}

function isSeats(value: number) {
  return value;
}
</script>

<template>
  <div>
    <ActionForm :action="$api._actionFormCheck.save" :fields="{ title: { label: 'Title' } }" hidden="teamId">
      <template #field-title="{ field }">
        {{ isString(notAny(field.value)) }}
      </template>
      <template #field-seats="{ field }">
        {{ isSeats(notAny(field.value)) }}
      </template>
    </ActionForm>
    <!-- @vue-expect-error -->
    <ActionForm :action="$api._actionFormCheck.save" :fields="{ nope: { label: 'x' } }" />
    <!-- @vue-expect-error -->
    <ActionForm :action="$api._actionFormCheck.save" hidden="nope" />
    <!-- @vue-expect-error -->
    <ActionForm :action="$api.health.echo" />
  </div>
</template>
