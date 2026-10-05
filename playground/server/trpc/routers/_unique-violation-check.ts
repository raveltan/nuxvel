import { randomUUID } from "node:crypto";
import { z } from "zod";
import { userTable } from "../../database/schema/auth.schema";

export default {
  insertUser: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(({ input }) =>
      useDb().insert(userTable).values({ id: randomUUID(), name: "Procedure", email: input.email }),
    ),
};
