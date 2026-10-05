import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { parseFields, withReferences } from "../generators/fields.ts";
import { schemaFiles, searchableColumns } from "../generators/make-schema.ts";
import { fieldsArg, tableArgs } from "../generators/crud-args.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:schema",
    description: "Generate a Drizzle table file and its insert/update Zod schemas.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the schema, e.g. blog-post (written to server/database/schema/blog-post.schema.ts and shared/schemas/blog-post.ts).",
      required: true,
    },
    ...fieldsArg,
    ...tableArgs,
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const searchable = searchableColumns(args.searchable);
    const fields = parseFields(await askFields(args._.slice(1), (specs) => parseFields(specs, searchable)), searchable);

    await generate(
      process.cwd(),
      async (paths) =>
        schemaFiles(args.name, paths, {
          softDeletes: args["soft-deletes"],
          searchable,
          domain: args.domain,
          fields: await withReferences(fields, paths, args.domain),
        }),
      args,
    );
  },
});
