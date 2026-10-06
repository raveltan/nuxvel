async function runAsBackgroundJob() {
  const caller = useCaller();
  return caller.health.ping();
}

export default defineEventHandler(async () => {
  const { user } = await useAuth();

  return {
    ping: await runAsBackgroundJob(),
    me: user ? await useCaller().profile.me() : null,
  };
});
