import alwaysFailsJob from "#server/jobs/_probe/always-fails";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  handler: async () => {
    await alwaysFailsJob.dispatch({});
  },
});
