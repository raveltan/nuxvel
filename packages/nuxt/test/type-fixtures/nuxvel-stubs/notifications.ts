import { z } from "zod";
import { named } from "../../../src/runtime/server/discovery/definition-name";
import { defineNotification } from "../../../src/runtime/server/notifications/define-notification";

export default [
  named(
    defineNotification({
      input: z.object({ name: z.string() }),
      via: ["database"],
      toDatabase: ({ name }) => ({ title: `Welcome, ${name}`, body: "" }),
    }),
    "welcome",
    "notifications/welcome.ts",
  ),
];
