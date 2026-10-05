import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";
import { storyFiles } from "../generators/make-story.ts";

export default defineCommand({
  meta: {
    name: "make:story",
    description: "Generate a Storybook story next to a component under app/components.",
  },
  args: {
    component: {
      type: "positional",
      description: "Path of the component relative to app/components/, without extension, e.g. base/Button.",
      required: true,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => storyFiles(args.component, paths), { ...args, prepare: false });
  },
});
