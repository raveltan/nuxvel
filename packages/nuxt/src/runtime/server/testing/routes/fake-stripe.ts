import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { type FakeStripeOptions, configureFakeStripe } from "../stripe/state";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  configureFakeStripe(await readSuperjsonBody<FakeStripeOptions>(event));

  return superjson.serialize(true);
});
