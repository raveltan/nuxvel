import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "key:issue",
    description: "Issue an API key for a user and print it once.",
  },
  args: {
    userId: {
      type: "positional",
      description: "Id of the user the key acts for.",
      required: true,
    },
    name: {
      type: "string",
      description: "What the key is for, e.g. ci.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "key:issue", userId: args.userId, name: args.name });
  },
});
