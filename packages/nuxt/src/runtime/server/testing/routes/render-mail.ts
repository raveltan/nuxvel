import { defineEventHandler } from "h3";
import superjson from "superjson";
import { renderMail } from "../../mail/render-mail";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, input, locale } = await readSuperjsonBody<{ name: string; input: unknown; locale?: string }>(event);

  return superjson.serialize(await settle(async () => renderMail(name, input, locale)));
});
