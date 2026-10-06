import { z } from "zod";

export const invalidateTags = defineAction({
  input: z.object({ id: z.number(), fail: z.boolean().default(false) }),
  handler: async ({ id, fail }) => {
    await cachePut(["probe-tag", id], "row", { minutes: 1 });
    await cachePut(["probe-tag", id, "comments"], "below", { minutes: 1 });
    await cachePut(["probe-tag", id + 1], "other row", { minutes: 1 });
    await cachePut("probe-plain", "plain", { minutes: 1 });
    await cachePut("probe-plain:list", "under plain", { minutes: 1 });
    await cachePut("probe-plainer", "other plain", { minutes: 1 });
    await cachePut("probe-glob:1", "globbed", { minutes: 1 });

    if (fail) throw new Error("rolled back");

    return { glob: "probe-glob:*" };
  },
  invalidates: (output, { id }) => [["probe-tag", id], "probe-plain", output.glob],
});
