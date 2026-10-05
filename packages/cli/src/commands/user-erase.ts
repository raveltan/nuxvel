import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";

export default defineCommand({
  meta: {
    name: "user:erase",
    description: "Delete every row declared under server/privacy for a user in one transaction, audit-logging the erasure. Asks first; pass --force outside a terminal.",
  },
  args: {
    id: {
      type: "positional",
      description: "Id of the user.",
      required: true,
    },
    force: {
      type: "boolean",
      description: "Erase without asking.",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.force) {
      await askConfirm(
        `Delete every row of user ${args.id}? This cannot be undone.`,
        `user:erase deletes every row of user ${args.id} and needs a confirmation`,
        "Cancelled: nothing was erased",
      );
    }

    process.exitCode = await runCommandInApp(process.cwd(), { kind: "user:erase", userId: args.id });
  },
});
