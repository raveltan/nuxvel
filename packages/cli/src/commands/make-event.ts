import { defineCommand } from "citty";
import { askFields } from "../ui/ask-missing-args.ts";
import { generate } from "../generators/generate.ts";
import { eventFiles } from "../generators/make-event.ts";
import { fieldsArg } from "../generators/crud-args.ts";
import { inputFieldValues } from "../generators/fields.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:event",
    description: "Generate a defineEvent under server/events, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the event, e.g. post.published (written to server/events/post/published.event.ts as publishedEvent).",
      required: true,
    },
    ...fieldsArg,
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const input = inputFieldValues(await askFields(args._.slice(1), (specs) => inputFieldValues(specs, "json")), "json");

    await generate(process.cwd(), (paths) => eventFiles(args.name, paths, args.domain, input), args);
  },
});
