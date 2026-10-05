import { defineCommand } from "citty";
import { z } from "zod";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { backupScript } from "../server/backup-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { print, success } from "../ui/output.ts";

const backupSchema = z.object({ stamp: z.string() });

export default defineCommand({
  meta: {
    name: "db:backup",
    description: "Back up the app's database, buckets and config on the server of an environment now.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const { app, server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    let stamp: string | undefined;

    await runOverSsh(
      target,
      backupScript({ app }),
      (line) => {
        if (line.startsWith("@backup ")) stamp = backupSchema.parse(JSON.parse(line.slice("@backup ".length))).stamp;
        else print(line);
      },
      { failure: "The backup failed" },
    );

    success(`Backed up ${app} on ${server.host} to /srv/nuxvel/backups/${app}/, as of ${stamp}`);
  },
});
