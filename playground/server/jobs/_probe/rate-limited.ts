export default defineJob({
  queue: "limited",
  limiter: { max: 1, duration: 60_000 },
  handler: () => {},
});
