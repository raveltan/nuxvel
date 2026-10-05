import { randomUUID } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { createApp } from "../server/create-app.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, type SshTarget, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print, printLine, success, warn } from "../ui/output.ts";
import type { DeployEnvironment } from "./define-deploy.ts";
import { ecosystemFile } from "./ecosystem.ts";
import type { planColor } from "./plan-color.ts";
import { type ServerState, serverStateSchema } from "./server-state.ts";

type Lock = { state: "missing" } | { state: "locked" | "holding"; by: string } | { state: "taken"; server: ServerState };

async function takeLock(target: SshTarget, variables: Record<string, string>): Promise<Lock> {
  let lock: Lock = { state: "missing" };

  await runOverSsh(
    target,
    deployScript("lock", variables),
    (line) => {
      if (line.startsWith("@locked ")) lock = { state: "locked", by: line.slice("@locked ".length) };
      else if (line.startsWith("@holding ")) lock = { state: "holding", by: line.slice("@holding ".length) };
      else if (line.startsWith("@server ")) {
        lock = { state: "taken", server: serverStateSchema.parse(JSON.parse(line.slice("@server ".length))) };
      } else if (line !== "@missing") printLine(line);
    },
    { failure: "The deploy failed" },
  );

  return lock;
}

export function describeLock(raw: string) {
  try {
    const { user, machine, time } = JSON.parse(raw);
    return `by ${user} on ${machine} since ${time}`;
  } catch {
    return raw;
  }
}

export type DeployTarget = {
  cwd: string;
  envName: string;
  app: string;
  environment: DeployEnvironment;
  server: DeployEnvironment["servers"][number];
};

export async function openDeploy(deploy: DeployTarget, options: { createMissing: boolean }) {
  const { app, server } = deploy;
  const target = sshTarget(deploy.cwd, server);
  const lockValue = JSON.stringify({ id: randomUUID(), user: userInfo().username, machine: hostname(), time: new Date().toISOString() });
  const variables = { APP: app, APP_DIR: `/srv/apps/${app}`, LOCK: lockValue };

  let lock = await takeLock(target, variables);
  if (lock.state === "missing" && options.createMissing) {
    print(`First deploy of ${app}: creating it on the server`);
    await createApp({ ...deploy, dryRun: false });
    lock = await takeLock(target, variables);
  }
  if (lock.state === "holding") {
    fail(`${app} is being deployed ${describeLock(lock.by)}, and that deploy is in its hold`, {
      hint: `Wait for the hold to end, or end it now with nuxvel rollback ${deploy.envName}`,
    });
  }
  if (lock.state === "locked") {
    fail(`${app} is being deployed ${describeLock(lock.by)}`, {
      hint: `Wait for that deploy to finish. If it stopped, run nuxvel deploy:unlock ${deploy.envName}`,
    });
  }
  if (lock.state !== "taken") fail(`${app} is not on ${server.host}`, { hint: `Deploy it first with nuxvel deploy ${deploy.envName}` });

  const session = {
    target,
    variables,
    lockValue,
    server: lock.server,
    holding: false,
    async release() {
      if (!session.holding) {
        await runOverSsh(target, deployScript("unlock", variables), printLine, { failure: "Releasing the deploy lock failed" });
      }
    },
  };

  return session;
}

type DeploySession = Awaited<ReturnType<typeof openDeploy>>;

export async function goLive(
  deploy: DeployTarget,
  session: DeploySession,
  plan: ReturnType<typeof planColor>,
  release: string,
) {
  const { app, environment, server } = deploy;
  const { target, variables } = session;
  const switchVariables = {
    ...variables,
    RELEASE: release,
    COLOR: plan.color,
    LIVE: plan.live ?? "",
    PORT: String(plan.port),
    WEB: String(plan.processes.web),
    WORKERS: String(plan.processes.worker),
    PROCESSES: JSON.stringify(plan.processes),
    ECOSYSTEM: ecosystemFile({ app, folder: variables.APP_DIR, ...plan }),
    SMOKE: environment.deploy.smoke.join(" "),
    DOMAIN: environment.domains[0] ?? server.host,
  };
  if (plan.strategy === "rolling" && !plan.secondColorFits && environment.deploy.strategy !== "rolling") {
    warn(`A second color of ${app} does not fit in the memory of ${server.host}: replacing its processes one at a time`);
  }
  await runOverSsh(target, deployScript(plan.strategy === "rolling" ? "roll" : "switch", switchVariables), printLine, {
    failure: "The deploy failed",
  });

  session.holding = true;
  const liveRelease = plan.live ? (session.server.states[app]?.releases[plan.live] ?? null) : null;
  const hold = {
    app,
    strategy: plan.strategy,
    environment: deploy.envName,
    dir: variables.APP_DIR,
    color: plan.color,
    live: liveRelease ? plan.live : null,
    release,
    liveRelease,
    port: plan.port,
    hold: environment.deploy.hold,
    keepReleases: environment.keepReleases,
    lock: session.lockValue,
    webhook: environment.alerts?.webhook,
  };
  let outcome = "none";
  await runOverSsh(
    target,
    deployScript("hold", { ...variables, HOLD: JSON.stringify(hold) }),
    (line) => {
      if (line.startsWith("@outcome ")) outcome = line.slice("@outcome ".length);
      else printLine(line);
    },
    { failure: "Following the hold failed" },
  );

  if (outcome === "switched-back") {
    const back = plan.strategy === "rolling" ? `${liveRelease}` : `${plan.live} with ${liveRelease}`;
    fail(`The release ${release} failed after the switch, ${app} is back on ${back}`, { hint: "Fix the release and deploy again" });
  }
  if (outcome !== "retired") fail(`The hold of ${release} stopped`, { hint: `See ${variables.APP_DIR}/hold.log on the server` });

  success(`Deployed the release ${release} of ${app} to ${server.host}, live on ${plan.color}`);
  if (!environment.backups?.offsite) warnNoOffsite(deploy.envName, server.host);
}

export function warnNoOffsite(envName: string, host: string) {
  warn(
    `${envName} has no off-site backup target: the backups stay on ${host}, and are lost with it`,
    "Set backups.offsite in nuxvel.deploy.ts and run nuxvel server:setup",
  );
}
