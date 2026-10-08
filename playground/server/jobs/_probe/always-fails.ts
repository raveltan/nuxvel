import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  channel: { public: true },
  handler: () => {
    throw new Error("probe.always-fails always fails");
  },
});
