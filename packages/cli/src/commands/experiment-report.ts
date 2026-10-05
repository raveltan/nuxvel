import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";

export default defineCommand({
  meta: {
    name: "experiment:report",
    description: "Show an experiment's exposures and conversion rates per variant, with confidence intervals and a sample-ratio mismatch check.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the experiment, e.g. checkout-cta.",
      required: true,
    },
    ...jsonArg,
  },
  async run({ args }) {
    if (!args.json) {
      process.exitCode = await runCommandInApp(process.cwd(), { kind: "experiment:report", name: args.name });
      return;
    }

    const report = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "experiment:report", name: args.name, outFile }),
      { parse: (value: unknown) => value },
    );

    if (report === undefined) process.exitCode = 1;
    else printJson(report);
  },
});
