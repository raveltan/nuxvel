export default defineEventHandler(() => {
  useNitroApp().captureError(new Error("eventless probe exploded"), { tags: ["probe"] });

  return { ok: true };
});
