import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { runSchedule } from "../run-schedule";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name } = await readSuperjsonBody<{ name: string }>(event);

  return superjson.serialize(await settle(() => runSchedule(name)));
});
