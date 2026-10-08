import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  channel: { public: true },
  handler: async (_input, { reportProgress }) => {
    await reportProgress(50);
    await reportProgress(100);
  },
});
