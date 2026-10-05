import { z } from "zod";

export default defineJob({
  input: z.object({ id: z.string(), type: z.string() }),
  handler: () => {},
});
