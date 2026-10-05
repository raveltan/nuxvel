<script setup lang="ts">
import type { ModalProps } from "@nuxt/ui";

type IsAny<T> = 0 extends 1 & T ? true : false;

type ConfirmUi = Parameters<ReturnType<typeof useConfirm>>[0]["ui"];
const postList = useQuery(useTRPC().post.list.queryOptions());
const confirmUiIsTyped: IsAny<ConfirmUi> extends true
  ? never
  : ConfirmUi extends ModalProps["ui"]
    ? true
    : never = true;
</script>

<template>
  <div>
    {{ confirmUiIsTyped }}
    <DataTable :query="postList" :ui="{ base: 'min-w-full' }" />
    <!-- @vue-expect-error -->
    <DataTable :query="postList" :ui="{ nope: 'x' }" />
    <UploadField name="profile-avatar" field="coverKey" :ui="{ base: 'h-24' }" />
    <!-- @vue-expect-error -->
    <UploadField name="profile-avatar" :ui="{ nope: 'x' }" />
  </div>
</template>
