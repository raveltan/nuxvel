import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { scheduleFiles } from "../generators/make-schedule.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:schedule",
    description: "Generate a defineSchedule under server/schedules, daily at 03:00.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the schedule, e.g. posts.prune-drafts (written to server/schedules/posts/prune-drafts.schedule.ts as postsPruneDraftsSchedule).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => scheduleFiles(args.name, paths, args.domain), args);
  },
});
