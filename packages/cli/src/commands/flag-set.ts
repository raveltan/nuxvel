import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { fail } from "../ui/fail.ts";

export default defineCommand({
  meta: {
    name: "flag:set",
    description: "Change a flag's targeting without a deploy; the change is audit-logged.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the flag, e.g. new-checkout.",
      required: true,
    },
    percentage: {
      type: "string",
      description: "Share of users, 0 to 100, the flag is on for.",
    },
    role: {
      type: "string",
      description: "Role to fix the value for, with --value (default true).",
    },
    value: {
      type: "string",
      description: "true or false. With --role, that role's value; alone, on (100%) or off (0%) for everyone.",
    },
  },
  async run({ args }) {
    const percentage = args.percentage === undefined ? undefined : Number(args.percentage);

    if (percentage !== undefined && !(percentage >= 0 && percentage <= 100)) {
      fail("--percentage must be a number from 0 to 100", { hint: "e.g. --percentage 25", exitCode: 2 });
    }

    if (args.value !== undefined && args.value !== "true" && args.value !== "false") {
      fail("--value must be true or false", { hint: "e.g. --role beta-tester --value true", exitCode: 2 });
    }

    process.exitCode = await runCommandInApp(process.cwd(), {
      kind: "flags:set",
      name: args.name,
      percentage,
      role: args.role,
      value: args.value === undefined ? undefined : args.value === "true",
    });
  },
});
