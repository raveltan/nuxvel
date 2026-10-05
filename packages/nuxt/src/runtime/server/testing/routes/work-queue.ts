import { defineEventHandler } from "h3";
import superjson from "superjson";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { workQueue } from "../work-queue";

export default defineEventHandler(async () => {
  refuseOutsideVitest();

  return superjson.serialize(await settle(() => workQueue()));
});
