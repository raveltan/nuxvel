export default defineEventHandler({
  onRequest: [rateLimit({ points: 1, window: { minutes: 1 }, by: "user" })],
  handler: () => "ok",
});
