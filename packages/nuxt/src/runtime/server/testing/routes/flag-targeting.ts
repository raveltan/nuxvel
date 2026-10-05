import { defineEventHandler } from "h3";
import superjson from "superjson";
import type { FlagName } from "../../flags/registry";
import { type FlagTargeting, setFlagTargeting } from "../../flags/targeting";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, targeting } = await readSuperjsonBody<{ name: FlagName; targeting: FlagTargeting }>(event);

  return superjson.serialize(await settle(() => setFlagTargeting(name, targeting)));
});
