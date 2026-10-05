import { defineCommand } from "citty";
import { type DeployTarget, goLive, openDeploy } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { planColor } from "../deploy/plan-color.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print, printLine, success, warn } from "../ui/output.ts";

async function reportFailedJobs(deploy: DeployTarget, variables: Record<string, string>) {
  let failed = 0;
  await runOverSsh(
    sshTarget(deploy.cwd, deploy.server),
    deployScript("failed", variables),
    (line) => {
      if (line.startsWith("@failed ")) failed = Number(line.slice("@failed ".length));
    },
    { failure: "Counting the failed jobs failed" },
  );

  const jobs = failed === 1 ? "1 job is" : `${failed} jobs are`;
  warn(
    `${jobs} in the failed lists of ${deploy.app}. Jobs that the rolled-back release queued with a new job name or payload version fail on the old workers and land there too`,
    `Run nuxvel queue:retry after the next deploy`,
  );
}

async function contractMigrationsOf(deploy: DeployTarget, variables: Record<string, string>, release: string) {
  const tags: string[] = [];
  await runOverSsh(
    sshTarget(deploy.cwd, deploy.server),
    deployScript("release-contract", { ...variables, RELEASE: release }),
    (line) => {
      if (line.startsWith("@contract ")) tags.push(line.slice("@contract ".length));
    },
    { failure: `Reading the contract migrations of ${release} failed` },
  );

  return tags;
}

async function rollbackInHold(deploy: DeployTarget, variables: Record<string, string>) {
  let held = true;
  let outcome = "none";
  await runOverSsh(
    sshTarget(deploy.cwd, deploy.server),
    deployScript("rollback-hold", variables),
    (line) => {
      if (line === "@no-hold") held = false;
      else if (line.startsWith("@outcome ")) outcome = line.slice("@outcome ".length);
      else printLine(line);
    },
    { failure: "The rollback failed" },
  );
  if (!held || outcome === "retired") return false;
  if (outcome !== "switched-back") {
    fail(`The rollback of ${deploy.app} during the hold did not finish`, { hint: `See ${variables.APP_DIR}/hold.log on the server` });
  }

  return true;
}

export default defineCommand({
  meta: {
    name: "rollback",
    description: "Put the app back on its previous release, or on a named one. Migrations are never undone.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    release: {
      type: "positional",
      description: "A release on the server to put back, e.g. 20260927T100000Z-abc1234. Defaults to the one before the live release.",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Roll back to a release older than an applied contract migration.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);
    const deploy = { cwd, envName: args.env, app, environment, server };
    const variables = { APP: app, APP_DIR: `/srv/apps/${app}` };

    if (!args.release && (await rollbackInHold(deploy, variables))) {
      await reportFailedJobs(deploy, variables);
      success(`Rolled ${app} back to the held release on ${server.host}`);
      return;
    }

    const session = await openDeploy(deploy, { createMissing: false });
    try {
      const state = session.server.states[app];
      const live = state?.active ? state.releases[state.active] : null;
      if (!live) fail(`${app} has no live release on ${server.host}`, { hint: `Deploy it with nuxvel deploy ${args.env}` });

      const { releases } = session.server;
      const release = args.release ?? releases.filter((name) => name < live).at(-1);
      if (!release) fail(`${app} has no release before ${live} on ${server.host}`);
      if (!releases.includes(release)) {
        fail(`${app} has no release ${release} on ${server.host}`, { hint: `Pick one of: ${releases.join(", ")}` });
      }
      if (release === live) fail(`${release} is already live`);

      const contained = await contractMigrationsOf(deploy, session.variables, release);
      const crossed = (state?.contractMigrations ?? []).filter((tag) => !contained.includes(tag));
      if (crossed.length > 0 && !args.force) {
        fail(`${release} is older than the applied contract migrations ${crossed.join(", ")}`, {
          hint: "It may read what they removed. Roll back to a newer release, or run it anyway with --force",
        });
      }

      print(`Rolling ${app} back from ${live} to ${release}, without migrations`);
      await goLive(deploy, session, planColor(app, environment, session.server), release);
      await reportFailedJobs(deploy, session.variables);
    } finally {
      await session.release();
    }
  },
});
