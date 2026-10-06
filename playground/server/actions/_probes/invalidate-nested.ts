export const invalidateNested = defineAction({
  handler: () => "nested",
  invalidates: ["comment"],
});
