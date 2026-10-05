import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { now } from "../../../clock/now";
import { useDb } from "../../../database/client";
import { schemaTable } from "../../../database/schema-table";
import { defineJob } from "../../../jobs/define-job";
import { loopbackAllowed, pinnedLookup, resolvePublicAddresses } from "../public-address";

const TIMEOUT_MS = 10_000;

function signature(secret: string, content: string) {
  return createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(content).digest("base64");
}

function post(url: URL, headers: Record<string, string>, body: string, addresses: { address: string; family: number }[]) {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<number>((resolve, reject) => {
    const outgoing = request(url, { method: "POST", headers, lookup: pinnedLookup(addresses), signal: AbortSignal.timeout(TIMEOUT_MS) }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });

    outgoing.on("error", (error) => reject(error.name === "AbortError" ? new Error(`Webhook endpoint did not answer within ${TIMEOUT_MS} ms`) : error));
    outgoing.end(body);
  });
}

export default defineJob({
  queue: "webhooks",
  input: z.object({ endpointId: z.number().int(), messageId: z.string(), body: z.string() }),
  attempts: 8,
  backoff: { type: "exponential", delay: 30_000 },
  async handler({ endpointId, messageId, body }) {
    const endpoints = schemaTable("webhook_endpoints");
    const [endpoint] = await useDb().select().from(endpoints).where(eq(endpoints.id, endpointId));

    if (!endpoint) return;

    const url = new URL(endpoint.url);

    if (url.protocol !== "https:" && !loopbackAllowed()) {
      throw new UnrecoverableError(`Webhook endpoint ${endpointId} does not use https`);
    }

    const { addresses, refused } = await resolvePublicAddresses(url);

    if (refused) throw new UnrecoverableError(`Webhook endpoint ${endpointId} resolves to the private address ${refused}`);

    const timestamp = String(Math.floor(now().getTime() / 1000));
    const status = await post(
      url,
      {
        "content-type": "application/json",
        "webhook-id": messageId,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature(endpoint.secret, `${messageId}.${timestamp}.${body}`)}`,
      },
      body,
      addresses,
    );

    if (status < 200 || status >= 300) throw new Error(`Webhook endpoint ${endpointId} answered ${status}`);
  },
});
