import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "user:export",
    description: "Print every row declared under server/privacy for a user, as JSON keyed by table.",
  },
  args: {
    id: {
      type: "positional",
      description: "Id of the user.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "user:export", userId: args.id });
  },
});
