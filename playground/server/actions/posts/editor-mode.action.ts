export const editorModeAction = defineAction({
  handler: async () => ({
    rollout: await flag("probe-rollout"),
    cta: await experiment("probe-cta"),
  }),
});
