import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { runCaptured } from "../run-captured.ts";
import { report, symbols } from "../ui/output.ts";
import { startTaskLog } from "../ui/spinner.ts";
import { parseServices } from "./published-ports.ts";

const COMPOSE_FILES = ["docker-compose.yml", "compose.yml"];
const SIGNALS = ["SIGINT", "SIGTERM"] as const;

export function composeFile(cwd: string) {
  return COMPOSE_FILES.find((file) => existsSync(join(cwd, file)));
}

export function isHealthy(state: string) {
  return state === "healthy" || state === "running";
}

export async function serviceStates(cwd: string) {
  const docker = (args: string[]) => promisify(execFile)("docker", ["compose", ...args], { cwd });
  const [config, ps] = await Promise.all([
    docker(["config", "--hash", "*"]),
    docker(["ps", "--all", "--format", "json"]),
  ]);
  const containers = parseServices(ps.stdout);

  return config.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [service = "", hash] = line.trim().split(/\s+/);
      const container = containers.find((entry) => entry.Service === service);
      return {
        service,
        state: container ? container.Health || container.State || "unknown" : "not created",
        outdated: Boolean(container) && container?.Labels?.match(/com\.docker\.compose\.config-hash=([0-9a-f]+)/)?.[1] !== hash,
      };
    });
}

/**
 * Starts the project's dev services — Postgres, Redis, Mailpit,
 * SeaweedFS — and waits until they are healthy, so `nuxvel dev` and
 * `nuxvel test:functional` find them up on a machine where nobody started them yet.
 *
 * Does nothing when the project has no compose file, or when each
 * service is already healthy and was created from the current compose
 * file. Running services created from an older compose file are
 * recreated with `docker compose up` and stay running when nuxvel
 * exits. Services it starts are stopped again
 * (`docker compose stop`) when nuxvel exits, Ctrl-C included, so a
 * stack that was already running stays up and nothing is left running
 * that the command started. A failing
 * `docker compose` (no Docker, services provided some other way) is
 * reported with its output and otherwise ignored: the command
 * continues, and whatever is missing fails where it is needed.
 * Returns whether the services are up.
 *
 * @param options.continues - `false` when the caller stops after this
 * step, so the failure hint does not say it continues. Default `true`.
 * @param options.stopOnExit - `false` to leave the services running
 * after nuxvel exits, as `nuxvel services up` does. Default `true`.
 */
export async function startDevServices(cwd: string, { continues = true, stopOnExit = true } = {}) {
  if (!composeFile(cwd)) return false;

  const states = await serviceStates(cwd).catch(() => []);
  const running = states.length > 0 && states.every(({ state }) => isHealthy(state));
  if (running && states.every(({ outdated }) => !outdated)) {
    report(`${symbols.step} Dev services are already healthy (docker compose)`);
    return true;
  }

  const keepOnExit = stopOnExit && !running ? stopServicesOnExit(cwd) : () => {};

  const log = startTaskLog(running ? "Updating dev services to the compose file (docker compose)" : "Starting dev services (docker compose)");
  const code = await runCaptured(cwd, "docker", ["compose", "up", "-d", "--wait"], log);

  if (code === "missing") {
    keepOnExit();
    log.fail(
      "docker is not installed",
      continues ? "Install Docker Desktop, or start the services yourself; continuing without them" : "Install Docker Desktop",
    );
  } else if (code !== 0) {
    log.fail(
      `Could not start the dev services: docker compose exited with code ${code}`,
      continues ? "Continuing without them" : undefined,
    );
  } else {
    log.done(running ? "Updated dev services to the compose file (docker compose)" : "Started dev services (docker compose)");
  }

  return code === 0;
}

function stopServicesOnExit(cwd: string) {
  const stop = () => {
    report(`${symbols.step} Stopping dev services (docker compose)`);
    try {
      execFileSync("docker", ["compose", "stop"], { cwd, stdio: "ignore" });
    } catch {}
  };
  // While a tool runs, spawnTool forwards the signal and ends nuxvel with process.exit, which runs the exit handler.
  const onSignal = (signal: NodeJS.Signals) => {
    if (process.listenerCount(signal) > 1) return;
    keep();
    stop();
    process.kill(process.pid, signal);
  };

  const keep = () => {
    process.off("exit", stop);
    for (const signal of SIGNALS) process.off(signal, onSignal);
  };

  process.once("exit", stop);
  for (const signal of SIGNALS) process.on(signal, onSignal);

  return keep;
}

export async function stopDevServices(cwd: string) {
  const log = startTaskLog("Stopping dev services (docker compose)");
  const code = await runCaptured(cwd, "docker", ["compose", "down"], log);

  if (code === "missing") log.fail("docker is not installed", "Install Docker Desktop");
  else if (code !== 0) log.fail(`Could not stop the dev services: docker compose exited with code ${code}`);
  else log.done("Stopped dev services (docker compose)");

  return code === 0;
}
