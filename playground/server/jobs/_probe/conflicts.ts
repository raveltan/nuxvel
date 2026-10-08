import { ConflictError } from "@nuxvel/nuxt/server/api";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  handler: () => {
    throw new ConflictError("probe.conflicts always conflicts");
  },
});
