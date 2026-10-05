import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { crudRouterFiles, routerFiles } from "../generators/make-router.ts";
import { crudArgs, crudOptions, fieldsArg } from "../generators/crud-args.ts";
import { parseFields, withReferences } from "../generators/fields.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";
import { fail } from "../ui/fail.ts";

export default defineCommand({
  meta: {
    name: "make:router",
    description: "Generate a thin tRPC router skeleton, or a full CRUD vertical slice with --crud.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the router, e.g. blog-post (written to server/trpc/routers/blog-post.router.ts as blogPostRouter).",
      required: true,
    },
    ...fieldsArg,
    crud: {
      type: "boolean",
      description: "Also generate the schema, policy, and create/update actions, wired into the router.",
      default: false,
    },
    ...crudArgs,
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const options = { ...crudOptions(args), domain: args.domain };
    const given = args.crud ? await askFields(args._.slice(1), (specs) => parseFields(specs, options.searchable)) : args._.slice(1);
    const fields = parseFields(given, options.searchable);

    if (!args.crud && (options.softDeletes || options.searchable.length > 0 || fields.length > 0)) {
      fail("Fields, --soft-deletes and --searchable need --crud", { hint: `Run nuxvel make:router ${args.name} --crud` });
    }

    await generate(
      process.cwd(),
      async (paths) =>
        args.crud
          ? crudRouterFiles(args.name, paths, { ...options, fields: await withReferences(fields, paths, args.domain) })
          : routerFiles(args.name, paths, args.domain),
      args,
    );
  },
});
