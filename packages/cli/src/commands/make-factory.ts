import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { syncFactories } from "../generators/factory-sync.ts";
import { factoryFiles } from "../generators/make-factory.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:factory",
    description: "Generate a defineFactory for a table under server/factories, with Faker values for its required columns, and its functional test.",
  },
  args: {
    table: {
      type: "positional",
      description: "Schema file of the table, under server/database/schema, e.g. posts (written to server/factories/posts.factory.ts as postsFactory).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => factoryFiles(args.table, paths, args.domain), args);
    await syncFactories(args.table, process.cwd());
  },
});
