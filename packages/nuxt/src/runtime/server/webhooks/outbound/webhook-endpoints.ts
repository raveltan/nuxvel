import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { useDb } from "../../database/client";
import { firstOrFail } from "../../database/first-or-fail";
import { schemaTable } from "../../database/schema-table";
import { NotFoundError, ValidationFailedError } from "../../errors/taxonomy";
import { hostOf, isRefusedAddress, loopbackAllowed } from "./public-address";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** A webhook endpoint as {@link listWebhookEndpoints} returns it: everything but the secret. */
export interface WebhookEndpoint {
  id: number;
  url: string;
  createdAt: Date;
}

function isAllowedUrl(value: string) {
  const url = new URL(value);
  const host = hostOf(url);
  const local = LOCAL_HOSTS.has(host);

  if (local) return loopbackAllowed();
  if (url.protocol !== "https:") return false;

  const family = isIP(host);

  return family === 0 || !isRefusedAddress(host, family === 4 ? 4 : 6);
}

const endpointInput = z.object({
  url: z
    .url({ protocol: /^https?$/, message: "Enter a URL that starts with https://" })
    .max(2000)
    .refine(isAllowedUrl, "Enter a public URL that starts with https://"),
});

/**
 * Adds an endpoint that {@link sendWebhook} posts every event to, and
 * returns it with its signing secret.
 *
 * Auto-imported on the server. The URL must use `https://` and must not
 * be a private, loopback, link-local or cloud metadata address. In dev
 * and in tests, `http://localhost` is allowed too. Throws a
 * {@link ValidationFailedError} on the `url` field otherwise. The secret
 * is a Standard Webhooks `whsec_` secret. Show it to the admin once: it
 * cannot be read again. Gate the procedure that calls it yourself, for
 * example with {@link adminProcedure}. Siblings:
 * {@link listWebhookEndpoints}, {@link removeWebhookEndpoint}.
 *
 * @example
 * ```ts
 * create: adminProcedure
 *   .input(z.object({ url: z.string() }))
 *   .mutation(({ input }) => addWebhookEndpoint(input.url)),
 * ```
 */
export async function addWebhookEndpoint(url: string): Promise<WebhookEndpoint & { secret: string }> {
  const result = endpointInput.safeParse({ url });

  if (!result.success) throw new ValidationFailedError(result.error);

  const endpoints = schemaTable("webhook_endpoints");

  return useDb()
    .insert(endpoints)
    .values({ url: result.data.url, secret: `whsec_${randomBytes(24).toString("base64")}` })
    .returning({ id: endpoints.id, url: endpoints.url, secret: endpoints.secret, createdAt: endpoints.createdAt })
    .then(firstOrFail);
}

/**
 * Lists the webhook endpoints, oldest first, without their secrets.
 *
 * Auto-imported on the server. See {@link addWebhookEndpoint}.
 */
export function listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const endpoints = schemaTable("webhook_endpoints");

  return useDb()
    .select({ id: endpoints.id, url: endpoints.url, createdAt: endpoints.createdAt })
    .from(endpoints)
    .orderBy(asc(endpoints.id));
}

/**
 * Removes a webhook endpoint and returns it. Its queued deliveries are
 * dropped.
 *
 * Auto-imported on the server. Throws a {@link NotFoundError} when no
 * endpoint has this ID. See {@link addWebhookEndpoint}.
 */
export async function removeWebhookEndpoint(id: number): Promise<WebhookEndpoint> {
  const endpoints = schemaTable("webhook_endpoints");
  const [removed] = await useDb()
    .delete(endpoints)
    .where(eq(endpoints.id, id))
    .returning({ id: endpoints.id, url: endpoints.url, createdAt: endpoints.createdAt });

  if (!removed) throw new NotFoundError("No such webhook endpoint");

  return removed;
}
