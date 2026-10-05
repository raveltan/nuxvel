import { z } from "zod";

const linkInput = z.object({ id: z.number(), expires: z.string(), signature: z.string() });
const textLinkInput = z.object({ id: z.string(), expires: z.string(), signature: z.string() });

export default {
  sign: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => signedUrl(`/links/${input.id}?team=7`, { expiresIn: 60 })),
  open: signedProcedure({ input: linkInput, path: ({ id }) => `/links/${id}?team=7`, actor: "probe-link" })
    .input(linkInput.extend({ note: z.string() }))
    .query(async ({ ctx, input }) => ({ actor: ctx.actor, user: ctx.user, ambient: (await useAuth()).actor, note: input.note })),
  openText: signedProcedure({ input: textLinkInput, path: ({ id }) => `/links/${id}?team=7`, actor: "probe-link" }).query(({ input }) => input.id),
};
