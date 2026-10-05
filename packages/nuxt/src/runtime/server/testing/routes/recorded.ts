import superjson from "superjson";
import { defineEventHandler } from "h3";
import { settleAfterResponse } from "../../auth/after-response";
import { relayOutbox } from "../../jobs/outbox-relay";
import { recordedEffects } from "../recorders";
import { refuseOutsideVitest } from "../refuse-outside-vitest";

export default defineEventHandler(async () => {
  refuseOutsideVitest();

  await settleAfterResponse();
  await relayOutbox();

  return superjson.serialize(recordedEffects());
});
