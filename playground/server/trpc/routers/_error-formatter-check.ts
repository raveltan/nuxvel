import { z } from "zod";

const requireTitle = probeNamed("_error-formatter-check.require-title", defineAction({
  input: z.object({ title: z.string().min(1, "Title is required") }),
  transaction: false,
  handler: (input) => input,
}));

const refuse = probeNamed("_error-formatter-check.refuse", defineAction({
  input: z.object({}),
  errors: { "check.refused": "Refused on purpose" },
  transaction: false,
  handler: (_input, _ctx, fail) => fail("check.refused"),
}));

export default {
  throwPlain: publicProcedure.query(() => {
    throw new Error("boom detail");
  }),
  actionFailed: publicProcedure.query(() =>
    refuse({}, { actor: systemActor("error-formatter-check") }),
  ),
  forbidden: publicProcedure.query(() => {
    throw new ForbiddenError("Not yours");
  }),
  conflictField: publicProcedure.query(() => {
    throw new ConflictError("Taken", { field: "slug" });
  }),
  unauthenticated: publicProcedure.query(() => requireAuth()),
  actionInvalid: publicProcedure.query(() =>
    requireTitle({ title: "" }, { actor: systemActor("error-formatter-check") }),
  ),
  inputInvalid: publicProcedure
    .input(z.object({ title: z.string().min(1, "Title is required") }))
    .query(({ input }) => input),
};
