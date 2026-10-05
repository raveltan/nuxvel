import { resolve } from "node:path";
import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "openapi:export",
    description: "Write the app's OpenAPI document to a file, or print it.",
  },
  args: {
    file: {
      type: "positional",
      description: "File to write, e.g. openapi.json. Prints to stdout without one.",
      required: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const outFile = args.file ? resolve(cwd, args.file) : undefined;

    process.exitCode = await runCommandInApp(cwd, { kind: "openapi:export", outFile });
  },
});
