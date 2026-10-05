import { createHash } from "node:crypto";
import { defineEventHandler, getRouterParam, readRawBody } from "h3";
import { z } from "zod";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { ConflictError, NotFoundError, ValidationFailedError } from "../errors/taxonomy";
import { UnauthenticatedError } from "../errors/unauthenticated-error";
import { findWebhook } from "../webhooks/registry";

const PROCESSING_FOR_SECONDS = 60;
const DONE_FOR_SECONDS = 7 * 24 * 60 * 60;

const jsonBody = z.string().transform((text, context): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: "custom", message: "Webhook body is not valid JSON" });
    return z.NEVER;
  }
});

const eventIdText = z.string().min(1, "Webhook event ID is empty");

function deliveryKey(name: string, eventId: string) {
  return redisKey(`nuxvel:webhooks:${name}:${eventId}`);
}

async function claimDelivery(key: string) {
  const claimed = await useRedis("durable").set(key, "processing", "EX", PROCESSING_FOR_SECONDS, "NX");

  return claimed === "OK";
}

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") ?? "";
  const webhook = findWebhook(name);

  if (!webhook) throw new NotFoundError(`No webhook is named "${name}"`);

  const rawBody = (await readRawBody(event, "utf8")) ?? "";
  const { headers } = event;

  if (!(await webhook.verify({ rawBody, headers }))) {
    throw new UnauthenticatedError("Webhook signature is invalid");
  }

  const parsed = jsonBody.safeParse(rawBody);

  if (!parsed.success) throw new ValidationFailedError(parsed.error);

  const receipt = await webhook.receive(parsed.data, headers);

  if (!receipt.success) throw new ValidationFailedError(receipt.error);

  const eventId = eventIdText.safeParse(receipt.eventId ?? createHash("sha256").update(rawBody).digest("hex"));

  if (!eventId.success) throw new ValidationFailedError(eventId.error);

  const key = deliveryKey(name, eventId.data);

  if (!(await claimDelivery(key))) {
    if ((await useRedis("durable").get(key)) === "done") return { received: true };

    throw new ConflictError("This delivery is already being handled");
  }

  try {
    await receipt.handle();
  } catch (error) {
    await useRedis("durable").del(key);
    throw error;
  }

  await useRedis("durable").set(key, "done", "EX", DONE_FOR_SECONDS);

  return { received: true };
});
