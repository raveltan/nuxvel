import { z } from "zod";

export default defineJob({
  attempts: 5,
  backoff: { type: "fixed", delay: 10 },
  unique: ({ name }) => name,
  input: z.object({ name: z.string().min(1) }),
  handler: () => {},
});
