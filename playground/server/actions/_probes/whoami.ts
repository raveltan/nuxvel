import { z } from "zod";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const whoami = defineAction({
  output: z.object({ type: z.string(), id: z.string() }),
  procedure: "public",
  handler: (_input, { actor }) => ({ type: actor.type, id: actor.id }),
});
