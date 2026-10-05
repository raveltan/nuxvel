import { z } from "zod";

export default defineJob({
  input: z.object({ title: z.string() }),
  handler: async ({ title }) => {
    await broadcast("_probe-public", "from-job", { title });
  },
});
