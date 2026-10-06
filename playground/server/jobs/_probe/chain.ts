import { z } from "zod";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await $jobs._probe.record.dispatch({ name });
  },
});
