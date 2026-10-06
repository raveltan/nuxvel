<script setup lang="ts">
type AuthSession = typeof authClient.$Infer.Session.session;

const queryCache = useQueryCache();
const requestFetch = useRequestFetch();

const sessions = useQuery({
  key: ["auth", "sessions"],
  query: () => requestFetch<AuthSession[]>("/api/auth/list-sessions"),
});

const { mutate: revoke, isLoading: revoking } = useMutation({
  mutation: async (token: string) => {
    const { error } = await authClient.revokeSession({ token });

    if (error) throw new Error(error.message ?? "Could not sign out that session");
  },
  onSettled: () => queryCache.invalidateQueries({ key: ["auth", "sessions"] }),
});

const newEmail = ref("");

const {
  mutate: changeEmail,
  isLoading: changingEmail,
  data: emailRequested,
} = useMutation({
  mutation: async (email: string) => {
    const { error } = await authClient.changeEmail({ newEmail: email, callbackURL: "/security" });

    if (error) throw new Error(error.message ?? "Could not change your email address");

    return true;
  },
});

const { user } = useUser();
const password = ref("");
const code = ref("");

const {
  mutate: enableTwoFactor,
  data: setup,
  isLoading: enabling,
} = useMutation({
  mutation: async (currentPassword: string) => {
    const { data, error } = await authClient.twoFactor.enable({ password: currentPassword });

    if (error || !("totpURI" in data)) throw new Error(error?.message ?? "Could not turn on two-factor sign-in");

    return data;
  },
});

const { mutate: confirmTwoFactor, isLoading: confirming } = useMutation({
  mutation: async (totp: string) => {
    const { error } = await authClient.twoFactor.verifyTotp({ code: totp });

    if (error) throw new Error(error.message ?? "That code did not match");
  },
});
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">Security</h1>
    <UCard>
      <template #header>
        <h2 class="font-semibold">Email address</h2>
      </template>
      <form class="flex gap-2" @submit.prevent="changeEmail(newEmail)">
        <UInput v-model="newEmail" type="email" aria-label="New email address" placeholder="New email address" class="flex-1" />
        <UButton type="submit" label="Change" :loading="changingEmail" />
      </form>
      <p v-if="emailRequested" class="mt-2 text-sm text-muted">Open the link in the mail we sent you.</p>
    </UCard>
    <UCard>
      <template #header>
        <h2 class="font-semibold">Two-factor sign-in</h2>
      </template>
      <p v-if="user?.twoFactorEnabled" class="text-sm">Two-factor sign-in is on.</p>
      <form v-else-if="!setup" class="flex gap-2" @submit.prevent="enableTwoFactor(password)">
        <UInput v-model="password" type="password" aria-label="Current password" placeholder="Current password" class="flex-1" />
        <UButton type="submit" label="Turn on" :loading="enabling" />
      </form>
      <div v-else class="space-y-3 text-sm">
        <p>Add this key to your authenticator app, then enter the code it shows.</p>
        <code class="block break-all">{{ setup.totpURI }}</code>
        <p>Keep these backup codes somewhere safe: {{ setup.backupCodes.join(", ") }}</p>
        <form class="flex gap-2" @submit.prevent="confirmTwoFactor(code)">
          <UInput v-model="code" aria-label="Authentication code" autocomplete="one-time-code" class="flex-1" />
          <UButton type="submit" label="Confirm" :loading="confirming" />
        </form>
      </div>
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
                :loading="revoking"
                @click="revoke(session.token)"
              />
            </li>
          </ul>
        </template>
      </QueryState>
    </UCard>
  </div>
</template>
