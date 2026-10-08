import { z } from "zod";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { roleProcedure } from "@nuxvel/nuxt/server/api";

export const editorsOnly = defineAction({
  output: z.string(),
  procedure: roleProcedure(["editor"]),
  handler: () => "edited",
});
