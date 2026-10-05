import { defineEventHandler } from "h3";
import superjson from "superjson";
import { type FakeResponse, setFakeResponses } from "../fetch-fake";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  setFakeResponses(await readSuperjsonBody<Record<string, FakeResponse>>(event));

  return superjson.serialize(true);
});
