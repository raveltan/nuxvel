<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

function requestUpload() {
  return $fetch("/api/uploads/profile-avatar", {
    method: "POST",
    body: { type: "image/png", size: 1 },
  });
}

type Presigned = Awaited<ReturnType<typeof requestUpload>>;

const presignedIsTyped: IsAny<Presigned> extends true
  ? never
  : Presigned extends { url: string; key: string; headers: { "content-type": string } }
    ? true
    : never = true;

const coverKey = ref("");
const optionalKey = ref<string>();

const avatarUpload = useUpload("profile-avatar");
type Uploaded = Awaited<ReturnType<typeof avatarUpload.upload>>;

const uploadIsTyped: IsAny<Uploaded> extends true ? never : Uploaded extends string ? true : never = true;
const progressIsTyped: typeof avatarUpload.progress.value extends number | null ? true : never = true;

// @ts-expect-error
useUpload("no-such-upload");
</script>

<template>
  <div>
    {{ presignedIsTyped }} {{ uploadIsTyped }} {{ progressIsTyped }}
    <UploadField v-model="coverKey" name="profile-avatar" />
    <UploadField v-model="optionalKey" name="profile-avatar" />
    <!-- @vue-expect-error -->
    <UploadField v-model="coverKey" name="no-such-upload" />
  </div>
</template>
