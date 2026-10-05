import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { t } from "../../../../../src/runtime/server/trpc/trpc";
import { userTable } from "~~/server/database/schema/auth.schema";

const testRouter = t.router({
  publicPing: publicProcedure.query(() => "public-pong"),
  publicCaller: publicProcedure.query(({ ctx }) => ({ userId: ctx.user?.id ?? null, actor: ctx.actor })),
  authedPing: authedProcedure.query(() => "authed-pong"),
  authedActor: authedProcedure.query(({ ctx }) => ctx.actor),
});

export default defineEventHandler(async () => {
  const caller = testRouter.createCaller({});

  const publicResult = await caller.publicPing();
  const publicCallerWhenSignedOut = await caller.publicCaller();

  let authedErrorCode: string | null = null;

  try {
    await caller.authedPing();
  } catch (error) {
    authedErrorCode = error instanceof TRPCError ? error.code : "UNKNOWN";
  }

  const admin = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Authed Procedure Admin",
      email: `${randomUUID()}@example.com`,
      role: "admin",
    })
    .returning()
    .then(firstOrFail);
  const signedInCaller = testRouter.createCaller({ user: admin });

  return {
    publicResult,
    authedErrorCode,
    adminId: admin.id,
    actor: await signedInCaller.authedActor(),
    publicCallerWhenSignedOut,
    publicCallerWhenSignedIn: await signedInCaller.publicCaller(),
  };
});
