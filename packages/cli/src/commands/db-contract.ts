import { defineCommand } from "citty";
import { openDeploy } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { plural, printLine, success, warn } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "db:contract",
    description: "Apply the deferred contract migrations of the live release, once no older release runs.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);
    const deploy = { cwd, envName: args.env, app, environment, server };
    const session = await openDeploy(deploy, { createMissing: false });
    let outcome = "";

    try {
      await runOverSsh(
        session.target,
        deployScript("contract", session.variables),
        (line) => {
          if (line.startsWith("@")) outcome = line;
          else printLine(line);
        },
        { failure: "The contract migrations failed" },
      );
    } finally {
      await session.release();
    }

    if (outcome === "@no-live") fail(`${app} has no live release on ${server.host}`, { hint: `Deploy it with nuxvel deploy ${args.env}` });
    if (outcome.startsWith("@older ")) {
      const [, color, release] = outcome.split(" ");
      fail(`The ${color} color of ${app} still runs ${release}, which may read what the contract migrations remove`, {
        hint: `Wait for the deploy to retire it, then run nuxvel db:contract ${args.env} again`,
      });
    }

    const [applied = 0, waiting = 0] = outcome.slice("@applied ".length).split(" ").map(Number);
    const migrations = (count: number) => plural(count, "contract migration");

    if (applied > 0) success(`Applied ${migrations(applied)} of ${app} on ${server.host}`);
    if (waiting > 0) {
      warn(
        `${migrations(waiting)} of ${app} on ${server.host} wait${waiting === 1 ? "s" : ""} on a backfill`,
        `Run nuxvel db:contract ${args.env} again once the backfill completed`,
      );
    }
    if (applied === 0 && waiting === 0) success(`${app} has no deferred contract migration on ${server.host}`);
  },
});
