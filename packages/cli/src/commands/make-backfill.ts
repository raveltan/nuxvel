import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { backfillFiles } from "../generators/make-backfill.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:backfill",
    description: "Generate a defineBackfill skeleton over a table, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the backfill, e.g. posts-content (written to server/database/backfills/posts-content.backfill.ts as postsContentBackfill).",
      required: true,
    },
    table: {
      type: "string",
      description: "Schema file of the table to walk, under server/database/schema, e.g. posts.",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => backfillFiles(args.name, args.table, paths, args.domain), args);
  },
});
