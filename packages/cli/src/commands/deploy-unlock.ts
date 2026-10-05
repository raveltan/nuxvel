import { defineCommand } from "citty";
import { type DeployTarget, describeLock } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";
import { fail } from "../ui/fail.ts";
import { success, warn } from "../ui/output.ts";

async function unlockIf(deploy: DeployTarget, lock: string) {
  let result = "";
  await runOverSsh(
    sshTarget(deploy.cwd, deploy.server),
    deployScript("unlock-stale", { APP: deploy.app, APP_DIR: `/srv/apps/${deploy.app}`, LOCK: lock }),
    (line) => {
      result = line;
    },
    { failure: "Removing the deploy lock failed" },
  );

  return result;
}

function age(raw: string) {
  let minutes: number;
  try {
    minutes = Math.floor((Date.now() - Date.parse(JSON.parse(raw).time)) / 60000);
  } catch {
    return "";
  }
  if (Number.isNaN(minutes)) return "";
  if (minutes < 120) return `, ${minutes} minutes ago`;
  if (minutes < 2880) return `, ${Math.floor(minutes / 60)} hours ago`;
  return `, ${Math.floor(minutes / 1440)} days ago`;
}

export default defineCommand({
  meta: {
    name: "deploy:unlock",
    description: "Remove the deploy lock of the app that a stopped deploy left behind, after a confirmation.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    force: {
      type: "boolean",
      description: "Remove the lock without asking.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);
    const deploy = { cwd, envName: args.env, app, environment, server };

    let result = await unlockIf(deploy, "");
    if (result.startsWith("@locked ")) {
      const lock = result.slice("@locked ".length);
      if (!args.force) {
        warn(
          `The deploy lock of ${app} is held ${describeLock(lock)}${age(lock)}`,
          "If that deploy still runs, two deploys can then run their migrations at the same time",
        );
        await askConfirm(
          `Remove the deploy lock of ${app}?`,
          `deploy:unlock ${args.env} removes the lock of a deploy that can still run, and needs a confirmation`,
          "Cancelled: the deploy lock stays",
        );
      }
      result = await unlockIf(deploy, lock);
    }

    if (result.startsWith("@holding ")) {
      fail(`The deploy of ${app} ${describeLock(result.slice("@holding ".length))} is still in its hold, the lock is not stale`, {
        hint: `Wait for the hold to end, or end it now with nuxvel rollback ${args.env}`,
      });
    }
    if (result.startsWith("@locked ")) {
      fail(`Another deploy took the lock of ${app} ${describeLock(result.slice("@locked ".length))}, the lock stays`);
    }
    if (result.startsWith("@removed ")) success(`Removed the deploy lock of ${app}, held ${describeLock(result.slice("@removed ".length))}`);
    else success(`${app} has no deploy lock on ${server.host}`);
  },
});
