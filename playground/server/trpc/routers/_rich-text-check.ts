import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";

export default {
  save: publicProcedure
    .meta({ openapi: { method: "POST", path: "/_rich-text", protect: false } })
    .input(richTextProbeInput)
    .output(z.object({ body: z.string() }))
    .mutation(async ({ input }) => {
      const row = await useDb()
        .insert(healthChecksTable)
        .values({ name: input.body })
        .returning({ name: healthChecksTable.name })
        .then(firstOrFail);
      return { body: row.name };
    }),
};
