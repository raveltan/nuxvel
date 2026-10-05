import { type H3Event, defineEventHandler } from "h3";
import superjson from "superjson";
import { spendProcedureLimit } from "../../security/point-of-use";
import { sharedLimit } from "../../security/rate-limit-registry";
import { consumeAttempt } from "../../security/sliding-window";
import { appRouter } from "../../trpc/router";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

type Request = { name: string; key: string } | { procedure: string; userId?: string };

async function spendShared(name: string, key: string) {
  const { points, seconds } = sharedLimit(name);
  for (let attempt = 0; attempt < points; attempt++) await consumeAttempt(`${name}:${key}`, points, seconds);
}

async function spendProcedure(path: string, userId: string | undefined, event: H3Event) {
  // the router type keeps middlewares private; the runtime procedure holds them in _def
  const procedure = Reflect.get(appRouter._def.procedures, path) as { _def: { middlewares: unknown[] } } | undefined;

  if (!procedure) throw new Error(`exhaustRateLimit: no tRPC procedure at "${path}"`);

  await spendProcedureLimit(procedure._def.middlewares, path, { userId, event });
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const request = await readSuperjsonBody<Request>(event);

  return superjson.serialize(
    await settle(() =>
      "procedure" in request
        ? spendProcedure(request.procedure, request.userId, event)
        : spendShared(request.name, request.key),
    ),
  );
});
