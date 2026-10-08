import { z } from "zod";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const secretRow = defineAction({
  procedure: "public",
  output: z.object({ id: z.number() }),
  handler: () => ({ id: 1, passwordHash: "hash" }),
});
