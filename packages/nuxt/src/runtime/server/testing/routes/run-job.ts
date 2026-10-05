import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { runJob } from "../run-job";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, input, userId } = await readSuperjsonBody<{ name: string; input: unknown; userId?: string }>(event);

  return superjson.serialize(await settle(() => runJob(name, input, userId)));
});
