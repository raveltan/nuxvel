<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const me = $api.profile.me.useQuery();

const avatarForm = useActionForm(setAvatarInput, $api.profile.setAvatar.mutationOptions(), {
  defaults: { key: "" },
  onSuccess: () => {
    avatarForm.state.key = "";
  },
});

const testMail = $api.profile.sendTestMail.useMutation();
const testNotification = $api.profile.sendTestNotification.useMutation();
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Profile</h1>
    <QueryState :query="me">
      <template #default="{ data }">
        <div class="space-y-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold">Avatar</h2>
            </template>
            <div class="flex items-center gap-6">
              <img
                v-if="data.avatarUrl"
                :src="data.avatarUrl"
                crossorigin="anonymous"
                alt="Your avatar"
                class="size-20 rounded-full object-cover"
              />
              <UAvatar v-else :alt="data.name" size="3xl" />
              <UForm
                :ref="avatarForm.ref"
                :schema="avatarForm.schema"
                :state="avatarForm.state"
                class="flex-1 space-y-4"
                @submit="avatarForm.submit"
              >
                <UploadField
                  v-model="avatarForm.state.key"
                  name="profile-avatar"
                  label="Upload a new avatar"
                  description="PNG, JPEG or WebP, up to 2 MB."
                  accept="image/png,image/jpeg,image/webp"
                />
                <UAlert v-if="avatarForm.formError" color="error" :title="avatarForm.formError" />
                <UButton
                  type="submit"
                  label="Save avatar"
                  :disabled="!avatarForm.state.key"
                  :loading="avatarForm.pending"
                />
              </UForm>
            </div>
          </UCard>
          <UCard>
            <template #header>
              <h2 class="font-semibold">Mail</h2>
            </template>
            <div class="flex flex-wrap items-center gap-4">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-mail"
                label="Send me a test mail"
                :loading="testMail.isLoading"
                @click="testMail.mutate()"
              />
              <p role="status" class="text-sm text-muted">
                <template v-if="testMail.data">Welcome mail queued to {{ testMail.data.to }}.</template>
              </p>
            </div>
          </UCard>
          <UCard>
            <template #header>
              <h2 class="font-semibold">Notifications</h2>
            </template>
            <div class="flex flex-wrap items-center gap-4">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-bell"
                label="Send me a test notification"
                :loading="testNotification.isLoading"
                @click="testNotification.mutate()"
              />
              <PushToggle />
            </div>
          </UCard>
        </div>
      </template>
    </QueryState>
  </div>
</template>
