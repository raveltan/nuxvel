<script setup lang="ts">
import { QueryState } from "@nuxvel/nuxt/app/api";
import { useChangeEmail, useSessions, useTwoFactor, useUser } from "@nuxvel/nuxt/app/auth";
import { DateTime } from "@nuxvel/nuxt/app/ui";

const { user } = useUser();
const { list: sessions, revoke } = useSessions();
const changeEmail = useChangeEmail();
const { enable, verify } = useTwoFactor();
const newEmail = ref("");
const password = ref("");
const code = ref("");
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Security</h1>
    <UCard>
      <template #header>
        <h2 class="font-semibold">Email address</h2>
      </template>
      <form class="flex gap-2" @submit.prevent="changeEmail.mutate(newEmail)">
        <UInput v-model="newEmail" type="email" aria-label="New email address" placeholder="New email address" class="flex-1" />
        <UButton type="submit" label="Change" :loading="changeEmail.isLoading" />
      </form>
      <p v-if="changeEmail.error" class="mt-2 text-sm text-error">{{ changeEmail.error.message }}</p>
      <p v-if="changeEmail.requested" class="mt-2 text-sm text-muted">Open the link in the mail we sent you.</p>
    </UCard>
    <UCard>
      <template #header>
        <h2 class="font-semibold">Two-factor sign-in</h2>
      </template>
      <p v-if="user?.twoFactorEnabled" class="text-sm">Two-factor sign-in is on.</p>
      <form v-else-if="!enable.data" class="flex gap-2" @submit.prevent="enable.mutate(password)">
        <UInput v-model="password" type="password" aria-label="Current password" placeholder="Current password" class="flex-1" />
        <UButton type="submit" label="Turn on" :loading="enable.isLoading" />
      </form>
      <div v-else class="space-y-3 text-sm">
        <p>Add this key to your authenticator app, then enter the code it shows.</p>
        <code class="block break-all">{{ enable.data.totpURI }}</code>
        <p>Keep these backup codes somewhere safe: {{ enable.data.backupCodes.join(", ") }}</p>
        <form class="flex gap-2" @submit.prevent="verify.mutate(code)">
          <UInput v-model="code" aria-label="Authentication code" autocomplete="one-time-code" class="flex-1" />
          <UButton type="submit" label="Confirm" :loading="verify.isLoading" />
        </form>
        <p v-if="verify.error" class="text-error">{{ verify.error.message }}</p>
      </div>
      <p v-if="enable.error" class="mt-2 text-sm text-error">{{ enable.error.message }}</p>
    </UCard>
    <UCard>
      <template #header>
        <h2 class="font-semibold">Where you are signed in</h2>
      </template>
      <QueryState :query="sessions">
        <template #default="{ data }">
          <ul class="divide-y divide-default">
            <li v-for="session in data" :key="session.id" class="flex items-center justify-between gap-4 py-3">
              <div class="min-w-0 text-sm">
                <p class="truncate">{{ session.userAgent || "Unknown device" }}</p>
                <p class="text-muted">
                  {{ session.ipAddress || "Unknown address" }}, last active
                  <DateTime :value="session.updatedAt" />
                </p>
              </div>
              <UButton
                label="Sign out"
                color="neutral"
                variant="outline"
                :loading="revoke.isLoading && revoke.variables === session.token"
                @click="revoke.mutate(session.token)"
              />
            </li>
          </ul>
        </template>
      </QueryState>
    </UCard>
  </div>
</template>
