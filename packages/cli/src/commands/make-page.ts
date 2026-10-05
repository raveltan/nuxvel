import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";
import { pageFiles } from "../generators/make-page.ts";

export default defineCommand({
  meta: {
    name: "make:page",
    description: "Generate a Nuxt page component.",
  },
  args: {
    name: {
      type: "positional",
      description: "Path of the page relative to pages/, without extension, e.g. blog/index.",
      required: true,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => pageFiles(args.name, paths), { ...args, prepare: false });
  },
});
