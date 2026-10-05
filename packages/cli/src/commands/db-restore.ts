import { defineCommand } from "citty";
import { z } from "zod";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { restoreScript } from "../server/restore-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print, success } from "../ui/output.ts";

const restoreSchema = z.object({ from: z.string(), target: z.string().nullable() });

export default defineCommand({
  meta: {
    name: "db:restore",
    description: "Restore a backup of the app's database on the server into a new database, and check it.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    from: {
      type: "string",
      description: "The backup to restore: latest (the default) or its time, e.g. 20260927T020312Z.",
      default: "latest",
    },
    to: {
      type: "string",
      description: "A Postgres URL to restore into instead of a new database on the server, e.g. of a staging database.",
    },
  },
  async run({ args }) {
    if (args.from !== "latest" && !/^\d{8}T\d{6}Z$/.test(args.from)) {
      fail(`--from must be latest or the time of a backup like 20260927T020312Z, got "${args.from}"`, { exitCode: 2 });
    }
    const { app, server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    let result: z.output<typeof restoreSchema> | undefined;

    await runOverSsh(
      target,
      restoreScript({ app, from: args.from, to: args.to }),
      (line) => {
        if (line.startsWith("@restore ")) result = restoreSchema.parse(JSON.parse(line.slice("@restore ".length)));
        else print(line);
      },
      { failure: "The restore failed" },
    );
    if (!result) fail("The restore failed");

    success(
      result.target
        ? `Restored the backup ${result.from} of ${app} into the new database ${result.target} on ${server.host}, the live database is untouched`
        : `Restored the backup ${result.from} of ${app} into the database of --to`,
    );
  },
});
