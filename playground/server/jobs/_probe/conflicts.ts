import { z } from "zod";

export default defineJob({
  input: z.object({}),
  handler: () => {
    throw new ConflictError("probe.conflicts always conflicts");
  },
});
