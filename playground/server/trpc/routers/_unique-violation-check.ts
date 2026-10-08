import { randomUUID } from "node:crypto";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";
import { publicProcedure } from "@nuxvel/nuxt/server/api";
import { useDb } from "@nuxvel/nuxt/server/database";

export default {
  insertUser: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(({ input }) =>
      useDb().insert(userTable).values({ id: randomUUID(), name: "Procedure", email: input.email }),
    ),
};
