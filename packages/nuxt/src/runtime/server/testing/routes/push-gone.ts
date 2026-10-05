import { defineEventHandler } from "h3";
import superjson from "superjson";
import { recordedEffects } from "../recorders";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { endpoint } = await readSuperjsonBody<{ endpoint: string }>(event);

  return superjson.serialize(await settle(async () => recordedEffects().goneEndpoints.push(endpoint)));
});
