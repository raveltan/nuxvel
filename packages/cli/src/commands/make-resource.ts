import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { crudRouterFiles } from "../generators/make-router.ts";
import { crudArgs, crudOptions, fieldsArg } from "../generators/crud-args.ts";
import { parseFields, withReferences } from "../generators/fields.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:resource",
    description: "Generate a full CRUD vertical slice (schema, policy, actions, router) plus its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the resource, e.g. blog-post.",
      required: true,
    },
    ...fieldsArg,
    ...crudArgs,
    ui: {
      type: "boolean",
      description: "Also generate a list page on <DataTable>, a new page and an edit page on useActionForm().",
      default: false,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const options = { ...crudOptions(args), domain: args.domain };
    const fields = parseFields(await askFields(args._.slice(1), (specs) => parseFields(specs, options.searchable)), options.searchable);

    await generate(
      process.cwd(),
      async (paths) =>
        crudRouterFiles(args.name, paths, { ...options, fields: await withReferences(fields, paths, args.domain) }, "resource-test.ts.txt"),
      args,
    );
  },
});
