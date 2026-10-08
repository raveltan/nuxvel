import { z } from "zod";
import { invalidateNested } from "#server/actions/_probes/invalidate-nested";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const invalidateDeclared = defineAction({
  input: z.object({ nested: z.boolean(), fail: z.boolean() }),
  handler: async ({ nested, fail }) => {
    if (nested) await invalidateNested({});
    if (fail) throw new Error("rolled back");

    return "done";
  },
  invalidates: [["post", { id: 1 }], "posts:*", "post:list"],
});
