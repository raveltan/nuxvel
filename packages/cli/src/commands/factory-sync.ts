import { defineCommand } from "citty";
import { syncFactories } from "../generators/factory-sync.ts";
import { print, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "factory:sync",
    description: "Append metadata-derived values to existing factories for columns that became required.",
  },
  args: {
    name: {
      type: "positional",
      description:
        "Name of a single factory under server/factories or server/domains/<domain>/factories, e.g. posts for posts.factory.ts or posts.ts.",
      required: false,
    },
  },
  async run({ args }) {
    const synced = await syncFactories(args.name, process.cwd());

    for (const { file, columns } of synced) {
      print(`${file}: added ${columns.join(", ")}`);
    }

    if (synced.length === 0) success("All factories are up to date");
  },
});
