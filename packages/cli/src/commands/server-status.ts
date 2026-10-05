import { defineCommand } from "citty";
import { z } from "zod";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { PROCESS_MB } from "../deploy/process-counts.ts";
import { appProcesses, diskPercent, serverStatusSchema, serverWarnings } from "../deploy/server-warnings.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { statusScript } from "../server/status-script.ts";
import { fail } from "../ui/fail.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { print, style, warn } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "server:status",
    description: "Show the apps, memory, disk, services, backups and slow queries of the server of an environment.",
  },
  args: {
    ...jsonArg,
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const { server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    let status: z.output<typeof serverStatusSchema> | undefined;

    await runOverSsh(
      target,
      statusScript({ deployUser: server.user }),
      (line) => {
        if (line.startsWith("@status ")) status = serverStatusSchema.parse(JSON.parse(line.slice("@status ".length)));
      },
      { failure: "Reading the server status failed" },
    );
    if (!status) fail(`Reading the server status of ${server.host} failed`);
    const warnings = serverWarnings(status);

    if (args.json) {
      printJson({ ...status, warnings });
      return;
    }

    const share = Math.floor(status.memory.appsMb / Math.max(status.apps.length, 1));
    print(`${server.host}`);
    print(`Disk     ${status.disk.usedMb} of ${status.disk.sizeMb} MB (${diskPercent(status.disk)}%)`);
    print(`Memory   ${status.memory.totalMb} MB, ${status.memory.appsMb} MB for apps, swap in use ${status.memory.swapUsedMb} MB`);
    print(`Services ${Object.entries(status.services).map(([name, up]) => `${name} ${up ? "up" : "down"}`).join(", ")}`);
    print();
    if (status.apps.length === 0) print("No apps");
    else {
      printTable(
        ["APP", "RELEASE", "PROCESSES", "MEMORY", "BACKUP"],
        status.apps.map((app) => [
          app.name,
          app.release ? `${app.release} (${app.color})` : "-",
          String(appProcesses(app.processes)),
          `${appProcesses(app.processes) * PROCESS_MB} of ${share} MB`,
          app.backup?.time ?? "none yet",
        ]),
      );
    }
    print();
    if (status.slowQueries.length === 0) print(style.dim("No query averages 500 ms or more"));
    else {
      printTable(
        ["DATABASE", "CALLS", "MEAN", "QUERY"],
        status.slowQueries.map((query) => [query.database, String(query.calls), `${query.meanMs} ms`, query.query]),
      );
    }
    for (const line of status.slowLog) print(style.dim(line));
    for (const warning of warnings) warn(warning);
  },
});
