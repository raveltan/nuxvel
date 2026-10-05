import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { mailFiles } from "../generators/make-mail.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:mail",
    description: "Generate a defineMail and its Vue template under server/mail, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the mail, e.g. order.shipped (written to server/mail/order/shipped.mail.ts as shippedMail).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => mailFiles(args.name, paths, args.domain), args);
  },
});
