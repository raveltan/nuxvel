import { z } from "zod";

const body = z.union([
  z.object({ add: z.string() }),
  z.object({ remove: z.number() }),
  z.object({ list: z.literal(true) }),
  z.object({ send: z.string(), rolledBack: z.string(), data: z.unknown() }),
]);

export default defineEventHandler(async (event) => {
  const request = body.parse(await readBody(event));

  if ("add" in request) return addWebhookEndpoint(request.add);
  if ("remove" in request) return removeWebhookEndpoint(request.remove);
  if ("list" in request) return listWebhookEndpoints();

  await transaction(async () => {
    await sendWebhook(request.rolledBack, request.data);
    throw new Error("probe rollback");
  }).catch(() => undefined);
  await sendWebhook(request.send, request.data);

  return { ok: true };
});
