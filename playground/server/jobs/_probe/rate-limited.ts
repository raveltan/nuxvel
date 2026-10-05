import { z } from "zod";

export default defineJob({
  queue: "limited",
  limiter: { max: 1, duration: 60_000 },
  input: z.object({}),
  handler: () => {},
});
