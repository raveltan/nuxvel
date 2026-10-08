import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  channel: { public: true },
  handler: () => ({
    get total(): number {
      throw new Error("The result cannot be serialized");
    },
  }),
});
