import { z } from "zod";

export const editorsOnly = defineAction({
  output: z.string(),
  procedure: roleProcedure(["editor"]),
  handler: () => "edited",
});
