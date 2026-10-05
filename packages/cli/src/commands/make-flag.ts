import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { flagFiles } from "../generators/make-flag.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:flag",
    description: "Generate a defineFlag under server/flags, off by default.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the flag, e.g. new-checkout (written to server/flags/new-checkout.flag.ts as newCheckoutFlag).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => flagFiles(args.name, paths, "flag", args.domain), args);
  },
});
