import { z } from "zod";

export default defineJob({
  channel: { authorize: () => true },
  input: z.object({}),
  handler: async (_input, { reportProgress }) => {
    await reportProgress(50);
    await reportProgress(100);
  },
});
