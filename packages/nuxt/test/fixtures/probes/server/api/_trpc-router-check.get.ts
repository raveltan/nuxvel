export default defineEventHandler(async () => {
  const caller = useCaller();
  return { ping: await caller.health.ping() };
});
