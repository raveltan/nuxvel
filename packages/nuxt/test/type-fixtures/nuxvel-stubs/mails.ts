import { h } from "vue";
import { z } from "zod";
import { named } from "../../../src/runtime/server/discovery/definition-name";
import { defineMail } from "../../../src/runtime/server/mail/define-mail";
import builtInMails from "./built-in-mails";

export default [
  named(
    defineMail({
      input: z.object({ to: z.string(), name: z.string() }),
      subject: ({ name }) => `Welcome, ${name}`,
      render: ({ name }) => h("p", name),
    }),
    "welcome",
    "mail/welcome.ts",
  ),
  ...builtInMails,
];
