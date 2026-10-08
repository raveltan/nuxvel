import { z } from "zod";
import { invalidateDeclared } from "#server/actions/_probes/invalidate-declared";
import { invalidateEmpty } from "#server/actions/_probes/invalidate-empty";
import { invalidateNothing } from "#server/actions/_probes/invalidate-nothing";
import { authedProcedure } from "@nuxvel/nuxt/server/api";

export default {
  declared: authedProcedure
    .input(z.object({ nested: z.boolean(), fail: z.boolean() }))
    .mutation(({ input }) => invalidateDeclared(input)),
  nothing: authedProcedure.mutation(() => invalidateNothing({})),
  empty: authedProcedure.mutation(() => invalidateEmpty({})),
  query: authedProcedure.query(() => invalidateDeclared({ nested: false, fail: false })),
};
