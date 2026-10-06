export default defineJob({
  channel: { authorize: () => true },
  handler: () => ({ total: BigInt(1) }),
});
