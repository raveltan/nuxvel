async function runAsBackgroundJob() {
  const caller = useCaller();
  return caller.health.ping();
}

export default defineEventHandler(async () => {
  const signedIn = await auth();

  return {
    ping: await runAsBackgroundJob(),
    me: signedIn ? await useCaller().profile.me() : null,
  };
});
