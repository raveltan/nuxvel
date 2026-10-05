import { z } from "zod";

export default defineJob({
  timeout: 100,
  input: z.object({}),
  handler: () => new Promise<void>(() => {}),
});
