import { z } from "zod";
import _probePublicChannel from "#server/channels/_probe-public";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  input: z.object({ title: z.string() }),
  handler: async ({ title }) => {
    await _probePublicChannel.broadcast("from-job", { title });
  },
});
