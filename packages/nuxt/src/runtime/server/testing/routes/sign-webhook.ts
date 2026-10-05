import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { signWebhook } from "../sign-webhook";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, body } = await readSuperjsonBody<{ name: string; body: Record<string, unknown> }>(event);

  return superjson.serialize(await settle(async () => signWebhook(name, body)));
});
