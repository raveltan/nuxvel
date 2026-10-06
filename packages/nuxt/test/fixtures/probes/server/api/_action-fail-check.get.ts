import { z } from "zod";

const doThing = probeNamed("_action-fail-check.doThing", defineAction({
  input: z.object({ shouldFail: z.boolean() }),
  errors: {
    "thing.notFound": "Thing not found",
  },
  handler: async (input, _ctx, fail) => {
    if (input.shouldFail) fail("thing.notFound");
    return { ok: true };
  },
}));

const doOtherThing = probeNamed("_action-fail-check.doOtherThing", defineAction({
  errors: {
    "thing.notFound": "Other thing not found",
  },
  handler: async (_input, _ctx, fail) => fail("thing.notFound"),
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_action-fail-check");

  let caught: unknown;
  try {
    await doThing({ shouldFail: true }, { actor });
  } catch (err) {
    caught = err;
  }

  const succeeded = await doThing({ shouldFail: false }, { actor });

  return {
    succeeded,
    isDeclaredCode: isActionError(caught, "thing.notFound"),
    isOtherCode: isActionError(caught, "thing.other"),
    isThisAction: isActionError(caught, doThing, "thing.notFound"),
    isOtherAction: isActionError(caught, doOtherThing, "thing.notFound"),
    failedAction: caught instanceof ActionError ? caught.action : undefined,
  };
});
