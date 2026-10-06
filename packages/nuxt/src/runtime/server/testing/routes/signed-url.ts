import { defineEventHandler } from "h3";
import superjson from "superjson";
import type { Duration } from "../../security/rate-limit-window";
import { signedUrl } from "../../security/signed-url";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { path, expiresIn } = await readSuperjsonBody<{ path: string; expiresIn: Duration }>(event);

  return superjson.serialize(await settle(async () => signedUrl(path, { expiresIn })));
});
