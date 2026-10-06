import { z } from "zod";

export const procedureMethodsCheckRouter = {
  update: authedProcedure.action($actions.posts.updatePost),
  whoami: publicProcedure.action($actions._probes.whoami),
  secret: publicProcedure.action($actions._probes.secretRow),
  greet: publicProcedure
    .openapi({ summary: "Greet", protect: false })
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .query(({ input }) => `Hello, ${input.name}`),
  rename: authedProcedure
    .openapi({ path: "/_procedure-methods/{id}", tags: ["posts"] })
    .output(z.object({ id: z.number(), title: z.string() }))
    .action($actions.posts.updatePost),
};
