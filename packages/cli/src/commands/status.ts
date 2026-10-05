import { defineCommand } from "citty";
import { z } from "zod";
import { warnNoOffsite } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { print, warn } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

const statusSchema = z.object({
  color: z.string().nullable(),
  release: z.string().nullable(),
  health: z.object({ ready: z.boolean(), status: z.number().nullable() }).nullable(),
  backup: z
    .object({ time: z.string(), offsite: z.object({ ok: z.boolean(), time: z.string(), error: z.string().optional() }).nullable().optional() })
    .loose()
    .nullable(),
  processes: z.array(
    z.object({
      name: z.string(),
      id: z.number(),
      status: z.string(),
      memoryMb: z.number(),
      restarts: z.number(),
      startedAt: z.string().nullable(),
    }),
  ),
});

function uptime(startedAt: string | null) {
  if (!startedAt) return "-";
  const minutes = Math.floor((Date.now() - Date.parse(startedAt)) / 60000);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function healthText(health: z.output<typeof statusSchema>["health"]) {
  if (!health) return "-";
  if (health.status === null) return "not answering";
  return `${health.ready ? "ready" : "not ready"} (${health.status})`;
}

function offsiteText(offsite: { ok: boolean; time: string; error?: string } | null | undefined) {
  if (!offsite) return "none";
  return offsite.ok ? `uploaded ${offsite.time}` : `failed ${offsite.time}: ${offsite.error ?? "unknown error"}`;
}

export default defineCommand({
  meta: {
    name: "status",
    description: "Show the app's processes, live release, health and last backup on the server of an environment.",
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
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);
    let status: z.output<typeof statusSchema> | undefined;

    await runOverSsh(
      sshTarget(cwd, server),
      deployScript("status", { APP: app, APP_DIR: `/srv/apps/${app}` }),
      (line) => {
        if (line.startsWith("@status ")) status = statusSchema.parse(JSON.parse(line.slice("@status ".length)));
      },
      { failure: "Reading the status failed" },
    );
    if (!status) fail(`${app} is not on ${server.host}`, { hint: `Deploy it with nuxvel deploy ${args.env}` });

    if (args.json) {
      printJson(status);
      return;
    }

    print(`${app} on ${server.host}`);
    print(`Release  ${status.release ? `${status.release} (${status.color})` : "none yet"}`);
    print(`Health   ${healthText(status.health)}`);
    print(`Backup   ${status.backup?.time ?? "none yet"}`);
    print(`Off-site ${offsiteText(status.backup?.offsite)}`);
    print();
    if (status.processes.length === 0) print("No processes");
    else {
      printTable(
        ["PROCESS", "ID", "STATUS", "MEMORY", "RESTARTS", "UPTIME"],
        status.processes.map((process) => [
          process.name,
          String(process.id),
          process.status,
          `${process.memoryMb} MB`,
          String(process.restarts),
          uptime(process.startedAt),
        ]),
      );
    }
    if (!environment.backups?.offsite) warnNoOffsite(args.env, server.host);
    else if (status.backup?.offsite?.ok === false) warn("The last off-site upload failed, the newest backup is only on the server");
  },
});
