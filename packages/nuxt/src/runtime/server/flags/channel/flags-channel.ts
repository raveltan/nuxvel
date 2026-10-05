import { z } from "zod";
import { defineChannel } from "../../realtime/define-channel";

export default defineChannel({
  events: { changed: z.object({ name: z.string() }) },
  authorize: () => true,
});
