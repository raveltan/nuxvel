import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { flagFiles } from "../generators/make-flag.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:experiment",
    description: "Generate a defineExperiment under server/flags with control and treatment variants.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the experiment, e.g. checkout-cta (written to server/flags/checkout-cta.experiment.ts as checkoutCtaExperiment).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => flagFiles(args.name, paths, "experiment", args.domain), args);
  },
});
