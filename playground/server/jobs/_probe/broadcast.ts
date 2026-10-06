import { z } from "zod";

export default defineJob({
  input: z.object({ title: z.string() }),
  handler: async ({ title }) => {
    await $channels._probePublic.broadcast("from-job", { title });
  },
});
