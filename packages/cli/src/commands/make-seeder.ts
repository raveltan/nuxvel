import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { seederFiles } from "../generators/make-seeder.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:seeder",
    description: "Generate a defineSeeder under server/seeders.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the seeder, e.g. blog.posts (written to server/seeders/blog/posts.seeder.ts as postsSeeder).",
      required: true,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => seederFiles(args.name, paths), args);
  },
});
