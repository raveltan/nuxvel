import { defineEventHandler } from "h3";
import superjson from "superjson";
import { type MaintenanceOptions, goDown, goUp } from "../../maintenance/state";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { down, options } = await readSuperjsonBody<{ down: boolean; options: MaintenanceOptions }>(event);

  return superjson.serialize(await settle(() => (down ? goDown(options) : goUp())));
});
