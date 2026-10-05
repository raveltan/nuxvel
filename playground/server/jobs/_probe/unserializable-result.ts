import { z } from "zod";

export default defineJob({
  channel: { authorize: () => true },
  input: z.object({}),
  handler: () => ({ total: BigInt(1) }),
});
