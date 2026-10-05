import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { jobFiles } from "../generators/make-job.ts";
import { fieldsArg } from "../generators/crud-args.ts";
import { inputFieldValues } from "../generators/fields.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:job",
    description: "Generate a defineJob under server/jobs, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the job, e.g. post.notify-subscribers (written to server/jobs/post/notify-subscribers.job.ts as notifySubscribersJob).",
      required: true,
    },
    ...fieldsArg,
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const input = inputFieldValues(await askFields(args._.slice(1), (specs) => inputFieldValues(specs, "json")), "json");

    await generate(process.cwd(), (paths) => jobFiles(args.name, paths, args.domain, input), args);
  },
});
