import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { FILE_HEADERS_ONLY, createTwoFilesPatch } from "diff";
import { modifiedFiles } from "../generated/modified-files.ts";
import { fail } from "../ui/fail.ts";
import { plural, print, success, warn } from "../ui/output.ts";
import { codemods } from "../upgrade/codemods.ts";
import { runCodemods } from "../upgrade/run-codemods.ts";

function selectedCodemods(only: string | undefined) {
  if (only === undefined) return codemods;

  const codemod = codemods.find(({ name }) => name === only);

  if (!codemod) {
    fail(`No codemod named ${only}`, {
      hint: `The codemods are ${codemods.map(({ name }) => name).join(", ")}`,
      exitCode: 2,
    });
  }

  return [codemod];
}

function reportHandEdited(cwd: string) {
  const edited = modifiedFiles(cwd);

  if (edited.length === 0) {
    success("No generated files were hand-edited");
    return;
  }

  for (const { path, status } of edited) print(`${status}: ${path}`);
}

export default defineCommand({
  meta: {
    name: "upgrade",
    description: "Apply the codemods of the installed nuxvel to the app's code.",
  },
  args: {
    "dry-run": {
      type: "boolean",
      description: "Print the changes as a diff and the hand-edited generated files, and write nothing",
      default: false,
    },
    only: {
      type: "string",
      description: "Run only the codemod with this name",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const dryRun = args["dry-run"];
    const selected = selectedCodemods(args.only);
    const { changed, manual } = await runCodemods(cwd, selected);

    for (const file of changed) {
      if (dryRun) {
        print(createTwoFilesPatch(`a/${file.path}`, `b/${file.path}`, file.before, file.after, undefined, undefined, { headerOptions: FILE_HEADERS_ONLY }).trimEnd());
      } else {
        writeFileSync(join(cwd, file.path), file.after);
        print(`updated: ${file.path}`);
      }
    }

    for (const step of manual) warn(step);

    if (dryRun) {
      if (changed.length > 0) success(`The codemods would update ${plural(changed.length, "file")}`);
      reportHandEdited(cwd);
      return;
    }

    success(changed.length === 0 ? "No codemod changed a file" : `Updated ${plural(changed.length, "file")}`);
  },
});
