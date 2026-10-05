import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { ForbiddenError } from "../errors/forbidden-error";
import { NotFoundError } from "../errors/taxonomy";
import { authedProcedure } from "../trpc/procedures";
import { type ApiKeySummary, issueApiKey } from "./api-keys";

const sessionProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.actor.type !== "user") throw new ForbiddenError("Manage API keys from a signed-in session");

  return next();
});

export const apiKeysRouter = {
  list: sessionProcedure.query(({ ctx }): Promise<ApiKeySummary[]> => {
    const apiKeys = schemaTable("api_keys");

    return useDb()
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.user.id))
      .orderBy(desc(apiKeys.createdAt));
  }),
  create: sessionProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100), expiresAt: z.date().optional() }))
    .mutation(({ input, ctx }) => issueApiKey(ctx.user.id, input)),
  revoke: sessionProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ input, ctx }) => {
    const apiKeys = schemaTable("api_keys");
    const revoked = await useDb()
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)))
      .returning({ id: apiKeys.id });

    if (revoked.length === 0) throw new NotFoundError("No such API key");

    return { id: input.id };
  }),
};
