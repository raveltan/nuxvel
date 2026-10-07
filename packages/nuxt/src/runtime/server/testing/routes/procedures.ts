import { defineEventHandler } from "h3";
import superjson from "superjson";
import { appRouter } from "../../trpc/router";
import { refuseOutsideVitest } from "../refuse-outside-vitest";

export default defineEventHandler(() => {
  refuseOutsideVitest();

  return superjson.serialize(Object.keys(appRouter()._def.procedures));
});
