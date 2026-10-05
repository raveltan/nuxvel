import { z } from "zod";

export default defineJob({
  input: z.object({}),
  handler: () => {
    process.kill(process.pid, "SIGTERM");
    throw new Error("probe.fails-while-stopping failed as the worker stopped");
  },
});
