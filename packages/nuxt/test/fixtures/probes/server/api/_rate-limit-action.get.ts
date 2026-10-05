import { z } from "zod";

const limitedEcho = probeNamed("_rate-limit-action.echo", defineAction({
  input: z.object({ key: z.string() }),
  rateLimit: { points: 2, window: { minutes: 1 }, by: ({ input }) => input.key },
  handler: ({ key }) => key,
}));

const limitedPerUser = probeNamed("_rate-limit-action.per-user", defineAction({
  input: z.object({}),
  rateLimit: { points: 1, window: { minutes: 1 }, by: "user" },
  handler: () => "ok",
}));

const sharedEcho = probeNamed("_rate-limit-action.shared", defineAction({
  input: z.object({ key: z.string() }),
  rateLimit: { limit: "_shared-probe", by: ({ input }) => input.key },
  handler: ({ key }) => key,
}));

export default defineEventHandler(async (event) => {
  const { key, shared } = getQuery(event);

  if (shared !== undefined) return sharedEcho({ key: String(shared) }, { actor: systemActor("rate-limit-probe") });

  if (key !== undefined) return limitedEcho({ key: String(key) }, { actor: systemActor("rate-limit-probe") });

  try {
    return await limitedPerUser({}, { actor: systemActor("rate-limit-probe") });
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
});
