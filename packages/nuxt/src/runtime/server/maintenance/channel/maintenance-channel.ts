import { z } from "zod";
import { defineChannel } from "../../realtime/define-channel";

export default defineChannel({
  events: {
    down: z.object({ message: z.string(), retryAfter: z.number() }),
    up: z.object({}),
  },
  authorize: () => true,
});
