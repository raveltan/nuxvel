import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { taskFiles } from "../generators/make-task.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:task",
    description: "Generate a Nitro task skeleton under server/tasks.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the task, e.g. reindex-posts.",
      required: true,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => taskFiles(args.name, paths), args);
  },
});
