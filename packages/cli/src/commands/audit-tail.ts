import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "audit:tail",
    description: "Print audit log rows as they are written, until interrupted.",
  },
  async run() {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "audit:tail" });
  },
});
