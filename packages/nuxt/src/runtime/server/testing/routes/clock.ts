import { defineEventHandler } from "h3";
import superjson from "superjson";
import { now, setTestClock } from "../../clock/now";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { readSuperjsonBody } from "../read-superjson-body";

interface ClockRequest {
  to?: Date;
  byMs?: number;
  frozen?: boolean;
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { to, byMs = 0, frozen } = await readSuperjsonBody<ClockRequest>(event);

  setTestClock({ at: new Date((to ?? now()).getTime() + byMs), frozen });

  return superjson.serialize(now());
});
