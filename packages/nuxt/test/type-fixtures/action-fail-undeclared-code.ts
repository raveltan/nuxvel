import { z } from "zod";
import { defineAction } from "../../src/runtime/server/actions/define-action";

const doThing = defineAction({
  input: z.object({ shouldFail: z.boolean() }),
  errors: {
    "thing.notFound": "Thing not found",
  },
  handler: (input, _ctx, fail) => {
    if (input.shouldFail) {
      // @ts-expect-error
      fail("thing.undeclaredCode");
    }
    return { ok: true };
  },
});

void doThing;
