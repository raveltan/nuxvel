import { defineCommand } from "citty";
import { modifiedFiles } from "../generated/modified-files.ts";
import { fail } from "../ui/fail.ts";
import { print, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "upgrade",
    description: "Report which generated files were hand-edited since they were written.",
  },
  args: {
    "dry-run": {
      type: "boolean",
      description: "Report only. The only supported mode for now.",
      default: false,
    },
  },
  run({ args }) {
    if (!args["dry-run"]) {
      fail("nuxvel upgrade supports --dry-run only for now", { hint: "Run nuxvel upgrade --dry-run", exitCode: 2 });
    }

    const changed = modifiedFiles(process.cwd());

    if (changed.length === 0) {
      success("No generated files were hand-edited");
      return;
    }

    for (const { path, status } of changed) print(`${status}: ${path}`);
  },
});
