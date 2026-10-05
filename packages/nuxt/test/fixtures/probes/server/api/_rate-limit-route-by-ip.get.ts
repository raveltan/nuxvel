export default defineEventHandler({
  onRequest: [rateLimit({ points: 1, window: { seconds: 30 }, by: "ip" })],
  handler: () => "ok",
});
