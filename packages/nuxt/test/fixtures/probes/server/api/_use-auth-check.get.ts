import { randomUUID } from "node:crypto";
import { z } from "zod";
import { t } from "../../../../../src/runtime/server/trpc/trpc";
import { userTable } from "~~/server/database/schema/auth.schema";
import { defineAction, systemActor, userActor } from "@nuxvel/nuxt/server/actions";
import { authedProcedure, publicProcedure } from "@nuxvel/nuxt/server/api";
import { useAuth } from "@nuxvel/nuxt/server/auth";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

async function readNestedAuth() {
  const { user, actor } = await useAuth();

  return { userId: user?.id ?? null, actor };
}

const echo = probeNamed("_use-auth-check.echo", defineAction({
  input: z.object({}),
  handler: () => readNestedAuth(),
}));

const testRouter = t.router({
  publicAuth: publicProcedure.query(() => readNestedAuth()),
  authedAuth: authedProcedure.query(() => readNestedAuth()),
  actionFromProcedure: authedProcedure.query(() => echo({})),
});

export default defineEventHandler(async () => {
  const user = await useDb()
    .insert(userTable)
    .values({ id: randomUUID(), name: "Use Auth User", email: `${randomUUID()}@example.com` })
    .returning()
    .then(firstOrFail);
  const signedIn = testRouter.createCaller({ user });

  return {
    userId: user.id,
    handler: await readNestedAuth(),
    systemAction: await echo({}, { actor: systemActor("_use-auth-check") }),
    userAction: await echo({}, { actor: userActor(user) }),
    publicSignedOut: await testRouter.createCaller({}).publicAuth(),
    publicSignedIn: await signedIn.publicAuth(),
    authed: await signedIn.authedAuth(),
    actionFromProcedure: await signedIn.actionFromProcedure(),
  };
});
