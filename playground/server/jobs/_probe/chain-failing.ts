import { z } from "zod";

export default defineJob({
  input: z.object({}),
  handler: async () => {
    await dispatchAfterCommit("_probe.always-fails", {});
  },
});
