import { z } from "zod";
import { named } from "../../../src/runtime/server/discovery/definition-name";
import { defineEvent } from "../../../src/runtime/server/events/define-event";

export default [
  named(
    defineEvent({
      payload: z.object({ name: z.string() }),
    }),
    "_probe.happened",
    "events/probe/happened.ts",
  ),
];
