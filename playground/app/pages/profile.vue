<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const trpc = useTRPC();
const queryCache = useQueryCache();
const me = useQuery(trpc.profile.me.queryOptions());

const avatarForm = useActionForm(setAvatarInput, trpc.profile.setAvatar.mutationOptions(), {
  defaults: { key: "" },
  onSuccess: () => {
    avatarForm.state.key = "";
    return queryCache.invalidateQueries({ key: trpc.profile.me.key() });
  },
});

const { mutate: sendTestMail, data: sentMail, isLoading: sending } = useMutation(
  trpc.profile.sendTestMail.mutationOptions(),
);

const { mutate: sendTestNotification, isLoading: notifying } = useMutation(
  trpc.profile.sendTestNotification.mutationOptions(),
);
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
                :loading="sending"
                @click="sendTestMail()"
              />
              <p role="status" class="text-sm text-muted">
                <template v-if="sentMail">Welcome mail queued to {{ sentMail.to }}.</template>
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
                :loading="notifying"
                @click="sendTestNotification()"
              />
              <PushToggle />
            </div>
          </UCard>
        </div>
      </template>
    </QueryState>
  </div>
</template>
