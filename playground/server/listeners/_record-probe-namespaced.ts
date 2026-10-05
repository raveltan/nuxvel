export default defineListener({
  event: $events._probe.happened,
  sync: true,
  handler: () => {},
});
