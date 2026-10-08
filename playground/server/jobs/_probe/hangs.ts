import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  timeout: { seconds: 0.1003 },
  handler: () => new Promise<void>(() => {}),
});
