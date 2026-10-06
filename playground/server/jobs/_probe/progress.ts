export default defineJob({
  channel: { authorize: () => true },
  handler: async (_input, { reportProgress }) => {
    await reportProgress(50);
    await reportProgress(100);
  },
});
