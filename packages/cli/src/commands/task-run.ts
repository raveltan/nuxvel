import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { fail } from "../ui/fail.ts";
import { errorMessage } from "../error-message.ts";
import { isRecord } from "../is-record.ts";

const PAYLOAD_HINT = `e.g. --payload '{"postId":1}'`;

function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fail(`--payload is not valid JSON: ${errorMessage(error)}`, {
      hint: PAYLOAD_HINT,
      exitCode: 2,
    });
  }
}

export default defineCommand({
  meta: {
    name: "task:run",
    description: "Run one task from server/tasks on demand.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the task, e.g. reindex-posts.",
      required: true,
    },
    payload: {
      type: "string",
      description: "JSON object passed to the task as its payload.",
    },
  },
  async run({ args }) {
    const payload = args.payload ? parsePayload(args.payload) : {};

    if (!isRecord(payload)) fail("--payload must be a JSON object", { hint: PAYLOAD_HINT, exitCode: 2 });

    process.exitCode = await runCommandInApp(process.cwd(), { kind: "task:run", name: args.name, payload });
  },
});
