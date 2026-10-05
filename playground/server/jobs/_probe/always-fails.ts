import { z } from "zod";

export default defineJob({
  channel: { authorize: () => true },
  input: z.object({}),
  handler: () => {
    throw new Error("probe.always-fails always fails");
  },
});
