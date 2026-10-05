import { z } from "zod";

export default {
  staff: roleProcedure(["admin", "agent"]).input(z.object({ id: z.number() })).query(({ ctx, input }) => ({ email: ctx.user.email, id: input.id })),
  withKeys: roleProcedure(["admin"], { apiKeys: true }).query(({ ctx }) => ctx.actor.type),
};
