import { type MaintenanceListing, maintenanceListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { liveRelease, RESULT_FILE, runInRelease } from "../deploy/run-in-release.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { printTable } from "../ui/table.ts";

async function statusOnServer(cwd: string, envName: string) {
  const { code, stdout } = await runInRelease(
    await liveRelease(cwd, envName),
    { kind: "maintenance:status", outFile: RESULT_FILE },
    { result: true },
  );

  return code === 0 ? maintenanceListingSchema.parse(JSON.parse(stdout)) : undefined;
}

function printStatus(status: MaintenanceListing) {
  const queue = status.queuePaused ? "paused" : "running";

  if (!status.down) {
    printTable(["STATE", "QUEUE"], [["up", queue]]);
    return;
  }

  printTable(
    ["STATE", "SINCE", "RETRY", "BYPASS", "ALLOW", "QUEUE", "MESSAGE"],
    [
      [
        "down",
        status.since,
        `${status.retryAfter}s`,
        status.bypass ? "secret" : "none",
        status.allow.join(",") || "none",
        queue,
        status.message,
      ],
    ],
  );
}

/**
 * `nuxvel maintenance:status` shows whether the app is in maintenance mode, with its message, bypass and queue state.
 *
 * Without an environment, it reads the state of the local app. With one, it reads it over SSH in the live release
 * on the server of that environment. It changes nothing, so it asks no confirmation.
 *
 * @example
 * ```sh
 * nuxvel maintenance:status production --json
 * ```
 */
export default defineCommand({
  meta: {
    name: "maintenance:status",
    description:
      "Show whether the app is in maintenance mode, with its message, bypass and queue state, locally or, with an environment, on its server.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production. Without it, the command runs locally.",
      required: false,
    },
    ...jsonArg,
  },
  async run({ args }) {
    const status = args.env
      ? await statusOnServer(process.cwd(), args.env)
      : await loadFromApp(process.cwd(), (outFile) => ({ kind: "maintenance:status", outFile }), maintenanceListingSchema);

    if (!status) {
      process.exitCode = 1;
      return;
    }

    if (args.json) printJson(status);
    else printStatus(status);
  },
});
