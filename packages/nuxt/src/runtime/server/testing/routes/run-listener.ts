import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { runListener } from "../run-listener";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, payload } = await readSuperjsonBody<{ name: string; payload: unknown }>(event);

  return superjson.serialize(await settle(() => runListener(name, payload)));
});
