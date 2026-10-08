import { z } from "zod";
import { secretRow } from "#server/actions/_probes/secret-row";
import { whoami } from "#server/actions/_probes/whoami";
import { updatePostAction } from "#server/actions/posts/update-post.action";
import { authedProcedure, publicProcedure } from "@nuxvel/nuxt/server/api";

export const procedureMethodsCheckRouter = {
  update: authedProcedure.action(updatePostAction),
  whoami: publicProcedure.action(whoami),
  secret: publicProcedure.action(secretRow),
  greet: publicProcedure
    .openapi({ summary: "Greet", protect: false })
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .query(({ input }) => `Hello, ${input.name}`),
  rename: authedProcedure
    .openapi({ path: "/_procedure-methods/{id}", tags: ["posts"] })
    .output(z.object({ id: z.number(), title: z.string() }))
    .action(updatePostAction),
};
