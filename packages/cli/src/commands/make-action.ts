import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { actionName } from "../generators/names.ts";
import { actionFiles } from "../generators/make-action.ts";
import { fieldsArg } from "../generators/crud-args.ts";
import { inputFieldValues } from "../generators/fields.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:action",
    description: "Generate a defineAction skeleton and its companion functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Domain and name of the action, e.g. posts/archive-post (written to server/actions/posts/archive-post.action.ts as archivePostAction).",
      required: true,
    },
    ...fieldsArg,
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const values = inputFieldValues(await askFields(args._.slice(1), (specs) => inputFieldValues(specs, "superjson")), "superjson");

    await generate(
      process.cwd(),
      (paths) => {
        const { domain, action } = actionName(args.domain ? `${args.domain}/${args.name}` : args.name);
        return actionFiles(domain, action, paths, { domainFolder: args.domain !== undefined, values });
      },
      args,
    );
  },
});
