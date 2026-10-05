import { defineEventHandler } from "h3";
import superjson from "superjson";
import { cachedEntry } from "../../cache/cache";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { key } = await readSuperjsonBody<{ key: string }>(event);

  return superjson.serialize(await settle(() => cachedEntry(key)));
});
